import "server-only";

import { writeAIImportLLMDebugLog } from "@/lib/ai-providers/llm-debug-logs";

type GeminiFetch = typeof fetch;

type GeminiFile = {
  mimeType?: string;
  mime_type?: string;
  name?: string;
  state?: string;
  uri?: string;
};

type GeminiFileResponse = {
  file?: GeminiFile;
};

type GeminiGenerateResponse = {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
      }[];
    };
  }[];
};

type GeminiNativePdfInput = {
  apiKey: string;
  baseUrl?: string;
  debugContext?: Record<string, unknown>;
  fetchImpl?: GeminiFetch;
  fileName: string;
  maxPollAttempts?: number;
  model: string;
  pdfBytes: Uint8Array | Buffer;
  pollDelayMs?: number;
  prompt: string;
};

type GeminiNativeTextTestInput = {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: GeminiFetch;
  model: string;
  prompt?: string;
};

const DEFAULT_GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com";
const GEMINI_PDF_MIME_TYPE = "application/pdf";
const GEMINI_UPLOAD_TIMEOUT_MS = 180_000;
const GEMINI_GENERATE_TIMEOUT_MS = 180_000;
const GEMINI_DELETE_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_DELAY_MS = 2_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 30;

function assertGeminiConfig({
  apiKey,
  model,
  pdfBytes,
}: Pick<GeminiNativePdfInput, "apiKey" | "model" | "pdfBytes">) {
  if (!apiKey?.trim()) {
    throw new Error("Gemini Native provider API key is missing.");
  }

  if (!model?.trim()) {
    throw new Error("Gemini Native provider model is missing.");
  }

  if (!pdfBytes?.byteLength) {
    throw new Error("Gemini Native PDF input is empty.");
  }
}

function assertGeminiTextConfig({
  apiKey,
  model,
}: Pick<GeminiNativeTextTestInput, "apiKey" | "model">) {
  if (!apiKey?.trim()) {
    throw new Error("Gemini Native provider API key is missing.");
  }

  if (!model?.trim()) {
    throw new Error("Gemini Native provider model is missing.");
  }
}

function geminiApiBaseUrl(value: string | null | undefined) {
  const trimmed = value?.trim() || DEFAULT_GEMINI_API_BASE_URL;

  return trimmed.replace(/\/+$/, "").replace(/\/v1beta$/i, "");
}

function safeDisplayName(value: string) {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9._ -]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "ai-import.pdf"
  );
}

function modelPath(model: string) {
  return encodeURIComponent(model.trim());
}

function fileResourceUrl(name: string, baseUrl: string) {
  const normalized = name.trim().replace(/^\/+/, "");
  const path = normalized.startsWith("files/")
    ? normalized
    : `files/${normalized}`;

  return `${geminiApiBaseUrl(baseUrl)}/v1beta/${path}`;
}

function generateContentUrl(model: string, baseUrl: string) {
  return `${geminiApiBaseUrl(baseUrl)}/v1beta/models/${modelPath(
    model,
  )}:generateContent`;
}

function fileMimeType(file: GeminiFile) {
  return file.mimeType ?? file.mime_type ?? GEMINI_PDF_MIME_TYPE;
}

function pdfBytesToBlob(pdfBytes: Uint8Array | Buffer) {
  const bytes = new Uint8Array(pdfBytes);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );

  return new Blob([arrayBuffer], { type: GEMINI_PDF_MIME_TYPE });
}

function fileState(file: GeminiFile | null | undefined) {
  return file?.state?.trim().toUpperCase() ?? "ACTIVE";
}

function fileFromPayload(payload: GeminiFileResponse | GeminiFile): GeminiFile {
  if ("file" in payload && payload.file) {
    return payload.file;
  }

  return payload as GeminiFile;
}

function responsePreview(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

async function safeResponseText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function readJson<T>(response: Response, operation: string): Promise<T> {
  const text = await safeResponseText(response);

  if (!response.ok) {
    throw new Error(
      `Gemini Native ${operation} failed (${response.status}).${
        text ? ` Response preview: ${responsePreview(text)}` : ""
      }`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `Gemini Native ${operation} returned invalid JSON: ${
        error instanceof Error ? error.message : "Unknown parse error"
      }.${text ? ` Response preview: ${responsePreview(text)}` : ""}`,
    );
  }
}

async function uploadGeminiFile({
  apiKey,
  baseUrl,
  displayName,
  fetchImpl,
  pdfBytes,
}: {
  apiKey: string;
  baseUrl: string;
  displayName: string;
  fetchImpl: GeminiFetch;
  pdfBytes: Uint8Array | Buffer;
}) {
  const startResponse = await fetchImpl(
    `${geminiApiBaseUrl(baseUrl)}/upload/v1beta/files`,
    {
      body: JSON.stringify({
        file: {
          display_name: displayName,
        },
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(pdfBytes.byteLength),
        "X-Goog-Upload-Header-Content-Type": GEMINI_PDF_MIME_TYPE,
        "X-Goog-Upload-Protocol": "resumable",
      },
      method: "POST",
      signal: AbortSignal.timeout(GEMINI_UPLOAD_TIMEOUT_MS),
    },
  );

  if (!startResponse.ok) {
    const text = await safeResponseText(startResponse);
    throw new Error(
      `Gemini Native file upload session failed (${startResponse.status}).${
        text ? ` Response preview: ${responsePreview(text)}` : ""
      }`,
    );
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");

  if (!uploadUrl) {
    throw new Error("Gemini Native file upload did not return an upload URL.");
  }

  const uploadResponse = await fetchImpl(uploadUrl, {
    body: pdfBytesToBlob(pdfBytes),
    headers: {
      "Content-Length": String(pdfBytes.byteLength),
      "Content-Type": GEMINI_PDF_MIME_TYPE,
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
    method: "POST",
    signal: AbortSignal.timeout(GEMINI_UPLOAD_TIMEOUT_MS),
  });
  const payload = await readJson<GeminiFileResponse>(
    uploadResponse,
    "file upload",
  );
  const file = payload.file;

  if (!file?.name || !file.uri) {
    throw new Error("Gemini Native file upload response did not include a file reference.");
  }

  return file;
}

async function waitForGeminiFile({
  apiKey,
  baseUrl,
  fetchImpl,
  file,
  maxPollAttempts,
  pollDelayMs,
}: {
  apiKey: string;
  baseUrl: string;
  fetchImpl: GeminiFetch;
  file: GeminiFile;
  maxPollAttempts: number;
  pollDelayMs: number;
}) {
  let current = file;

  for (let attempt = 0; attempt <= maxPollAttempts; attempt += 1) {
    const state = fileState(current);

    if (state === "ACTIVE") {
      return current;
    }

    if (state === "FAILED") {
      throw new Error("Gemini Native file processing failed.");
    }

    if (!current.name) {
      throw new Error("Gemini Native file reference is missing a resource name.");
    }

    if (attempt === maxPollAttempts) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, pollDelayMs));

    const response = await fetchImpl(fileResourceUrl(current.name, baseUrl), {
      headers: {
        "X-Goog-Api-Key": apiKey,
      },
      method: "GET",
      signal: AbortSignal.timeout(GEMINI_UPLOAD_TIMEOUT_MS),
    });
    const payload = await readJson<GeminiFileResponse | GeminiFile>(
      response,
      "file status check",
    );
    current = fileFromPayload(payload);
  }

  throw new Error("Gemini Native file did not become ACTIVE before timeout.");
}

async function deleteGeminiFile({
  apiKey,
  baseUrl,
  fetchImpl,
  file,
}: {
  apiKey: string;
  baseUrl: string;
  fetchImpl: GeminiFetch;
  file: GeminiFile | null;
}) {
  if (!file?.name) {
    return;
  }

  try {
    await fetchImpl(fileResourceUrl(file.name, baseUrl), {
      headers: {
        "X-Goog-Api-Key": apiKey,
      },
      method: "DELETE",
      signal: AbortSignal.timeout(GEMINI_DELETE_TIMEOUT_MS),
    });
  } catch {
    // Gemini Files API entries expire automatically, so cleanup failure should
    // not mask the import result or leak provider implementation details.
  }
}

async function generateContent({
  apiKey,
  baseUrl,
  debugContext,
  fetchImpl,
  parts,
  model,
}: {
  apiKey: string;
  baseUrl: string;
  debugContext?: Record<string, unknown>;
  fetchImpl: GeminiFetch;
  parts: Record<string, unknown>[];
  model: string;
}) {
  const requestBody = {
    contents: [
      {
        parts,
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  };

  await writeAIImportLLMDebugLog({
    context: {
      ...debugContext,
      adapter: "gemini_native",
      model,
    },
    event: "request",
    payload: {
      body: requestBody,
      endpoint: generateContentUrl(model, baseUrl),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": "[redacted]",
      },
      method: "POST",
    },
  });

  let response: Response;
  try {
    response = await fetchImpl(
      generateContentUrl(model, baseUrl),
      {
        body: JSON.stringify(requestBody),
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        method: "POST",
        signal: AbortSignal.timeout(GEMINI_GENERATE_TIMEOUT_MS),
      },
    );
  } catch (error) {
    await writeAIImportLLMDebugLog({
      context: {
        ...debugContext,
        adapter: "gemini_native",
        model,
      },
      event: "error",
      payload: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "UnknownError",
      },
    });
    throw error;
  }
  if (!response.ok) {
    const text = await response.clone().text().catch(() => "");
    await writeAIImportLLMDebugLog({
      context: {
        ...debugContext,
        adapter: "gemini_native",
        model,
      },
      event: "error",
      payload: {
        body: text,
        status: response.status,
        statusText: response.statusText,
      },
    });
  }
  const payload = await readJson<GeminiGenerateResponse>(
    response,
    "generateContent",
  );
  await writeAIImportLLMDebugLog({
    context: {
      ...debugContext,
      adapter: "gemini_native",
      model,
    },
    event: "response",
    payload: {
      body: payload,
      status: response.status,
      statusText: response.statusText,
    },
  });
  const text = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text)
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n\n")
    .trim();

  if (!text) {
    throw new Error("Gemini Native response did not include text content.");
  }

  return text;
}

export async function generateWithGeminiNativePdf({
  apiKey,
  baseUrl = DEFAULT_GEMINI_API_BASE_URL,
  debugContext,
  fetchImpl = fetch,
  fileName,
  maxPollAttempts = DEFAULT_MAX_POLL_ATTEMPTS,
  model,
  pdfBytes,
  pollDelayMs = DEFAULT_POLL_DELAY_MS,
  prompt,
}: GeminiNativePdfInput): Promise<{ text: string }> {
  assertGeminiConfig({ apiKey, model, pdfBytes });

  let uploadedFile: GeminiFile | null = null;

  try {
    uploadedFile = await uploadGeminiFile({
      apiKey,
      baseUrl,
      displayName: safeDisplayName(fileName),
      fetchImpl,
      pdfBytes,
    });
    const activeFile = await waitForGeminiFile({
      apiKey,
      baseUrl,
      fetchImpl,
      file: uploadedFile,
      maxPollAttempts,
      pollDelayMs,
    });

    if (!activeFile.uri) {
      throw new Error("Gemini Native file reference is missing a URI.");
    }

    return {
      text: await generateContent({
        apiKey,
        baseUrl,
        debugContext,
        fetchImpl,
        model,
        parts: [
          { text: prompt },
          {
            file_data: {
              file_uri: activeFile.uri,
              mime_type: fileMimeType(activeFile),
            },
          },
        ],
      }),
    };
  } finally {
    await deleteGeminiFile({
      apiKey,
      baseUrl,
      fetchImpl,
      file: uploadedFile,
    });
  }
}

export async function testGeminiNativeTextConnection({
  apiKey,
  baseUrl = DEFAULT_GEMINI_API_BASE_URL,
  fetchImpl = fetch,
  model,
  prompt = "Return exactly: ok",
}: GeminiNativeTextTestInput): Promise<{ message: string; ok: true }> {
  assertGeminiTextConfig({ apiKey, model });
  const text = await generateContent({
    apiKey,
    baseUrl,
    fetchImpl,
    model,
    parts: [{ text: prompt }],
  });

  return {
    message: text.toLowerCase().includes("ok")
      ? "Gemini Native connection test passed."
      : `Gemini Native connection test passed. Provider replied: ${text.slice(
          0,
          80,
        )}`,
    ok: true as const,
  };
}

export async function generateWithGeminiNativeText({
  apiKey,
  baseUrl = DEFAULT_GEMINI_API_BASE_URL,
  debugContext,
  fetchImpl = fetch,
  model,
  prompt,
}: GeminiNativeTextTestInput & {
  debugContext?: Record<string, unknown>;
  prompt: string;
}): Promise<{ text: string }> {
  assertGeminiTextConfig({ apiKey, model });

  return {
    text: await generateContent({
      apiKey,
      baseUrl,
      debugContext,
      fetchImpl,
      model,
      parts: [{ text: prompt }],
    }),
  };
}
