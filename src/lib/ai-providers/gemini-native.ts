import "server-only";

import type { AIProviderExecutionObserver } from "@/lib/ai-providers/execution-budget";
import {
  buildGeminiGenerationConfig,
  type GeminiOutputContract,
} from "@/lib/ai-providers/gemini-structured-output";
import { writeAIImportLLMDebugLog } from "@/lib/ai-providers/llm-debug-logs";
import { assertSafeAIProviderBaseUrl } from "@/lib/ai-providers/network-safety";
import { readResponseTextWithLimit } from "@/lib/ai-providers/response-limits";

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
  usageMetadata?: {
    cachedContentTokenCount?: number;
    candidatesTokenCount?: number;
    promptTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
};

export type GeminiNativeUsage = {
  cachedInputTokens: number | null;
  candidateOutputTokens?: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  thoughtTokens?: number | null;
  totalTokens: number | null;
};

type GeminiNativePdfInput = {
  apiKey: string;
  baseUrl?: string;
  debugContext?: Record<string, unknown>;
  executionObserver?: AIProviderExecutionObserver;
  fetchImpl?: GeminiFetch;
  fileName: string;
  maxPollAttempts?: number;
  model: string;
  outputContract?: GeminiOutputContract;
  pdfBytes: Uint8Array | Buffer;
  pollDelayMs?: number;
  prompt: string;
};

type GeminiNativeTextTestInput = {
  apiKey: string;
  baseUrl?: string;
  executionObserver?: AIProviderExecutionObserver;
  fetchImpl?: GeminiFetch;
  model: string;
  outputContract?: GeminiOutputContract;
  prompt?: string;
};

const DEFAULT_GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com";
const GEMINI_PDF_MIME_TYPE = "application/pdf";
const GEMINI_UPLOAD_TIMEOUT_MS = 180_000;
const GEMINI_GENERATE_TIMEOUT_MS = 180_000;
const GEMINI_DELETE_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_DELAY_MS = 2_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 30;
const GEMINI_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;
const SAFE_PROVIDER_STATUS_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const SAFE_FIELD_PATH_PATTERN = /^[A-Za-z0-9_$.[\]-]{1,240}$/;

export type GeminiNativeSafeErrorDetails = {
  detailTypes: string[];
  fieldViolationPaths: string[];
  providerStatus: string | null;
  statusCode: number;
};

export class GeminiNativeRequestError extends Error {
  readonly detailTypes: string[];
  readonly fieldViolationPaths: string[];
  readonly providerStatus: string | null;
  readonly statusCode: number;

  constructor({
    details,
    operation,
  }: {
    details: GeminiNativeSafeErrorDetails;
    operation: string;
  }) {
    super(
      `Gemini Native ${operation} failed (${details.statusCode}${
        details.providerStatus ? `; ${details.providerStatus}` : ""
      }).`,
    );
    this.name = "GeminiNativeRequestError";
    this.detailTypes = details.detailTypes;
    this.fieldViolationPaths = details.fieldViolationPaths;
    this.providerStatus = details.providerStatus;
    this.statusCode = details.statusCode;
  }
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function safeProviderStatus(value: unknown) {
  return typeof value === "string" && SAFE_PROVIDER_STATUS_PATTERN.test(value)
    ? value
    : null;
}

function safeFieldPath(value: unknown) {
  return typeof value === "string" && SAFE_FIELD_PATH_PATTERN.test(value)
    ? value
    : null;
}

function safeDetailType(value: unknown) {
  if (typeof value !== "string") return null;
  const candidate = value.split("/").at(-1)?.split(".").at(-1) ?? "";
  return /^[A-Za-z][A-Za-z0-9_]{1,79}$/.test(candidate) ? candidate : null;
}

export function parseGeminiNativeSafeErrorDetails({
  responseText,
  statusCode,
}: {
  responseText: string;
  statusCode: number;
}): GeminiNativeSafeErrorDetails {
  let payload: unknown = null;
  try {
    payload = JSON.parse(responseText);
  } catch {
    // The status code remains sufficient for safe classification.
  }

  const providerError = asRecord(asRecord(payload).error);
  const details = Array.isArray(providerError.details)
    ? providerError.details
    : [];
  const detailTypes = new Set<string>();
  const fieldViolationPaths = new Set<string>();

  for (const detail of details.slice(0, 10)) {
    const detailRecord = asRecord(detail);
    const detailType = safeDetailType(detailRecord["@type"]);
    if (detailType) detailTypes.add(detailType);

    const violations = Array.isArray(detailRecord.fieldViolations)
      ? detailRecord.fieldViolations
      : [];
    for (const violation of violations.slice(0, 20)) {
      const fieldPath = safeFieldPath(asRecord(violation).field);
      if (fieldPath) fieldViolationPaths.add(fieldPath);
    }
  }

  return {
    detailTypes: Array.from(detailTypes).sort(),
    fieldViolationPaths: Array.from(fieldViolationPaths).sort(),
    providerStatus: safeProviderStatus(providerError.status),
    statusCode,
  };
}

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

async function safeResponseText(response: Response) {
  try {
    return await readResponseTextWithLimit(response, GEMINI_RESPONSE_MAX_BYTES);
  } catch {
    return "";
  }
}

async function readJson<T>(response: Response, operation: string): Promise<T> {
  const text = await safeResponseText(response);

  if (!response.ok) {
    throw new GeminiNativeRequestError({
      details: parseGeminiNativeSafeErrorDetails({
        responseText: text,
        statusCode: response.status,
      }),
      operation,
    });
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Gemini Native ${operation} returned invalid JSON.`);
  }
}

async function uploadGeminiFile({
  apiKey,
  baseUrl,
  displayName,
  executionObserver,
  fetchImpl,
  pdfBytes,
}: {
  apiKey: string;
  baseUrl: string;
  displayName: string;
  executionObserver?: AIProviderExecutionObserver;
  fetchImpl: GeminiFetch;
  pdfBytes: Uint8Array | Buffer;
}) {
  executionObserver?.recordNetworkRequest("file_upload_start");
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
      redirect: "error",
      signal: AbortSignal.timeout(GEMINI_UPLOAD_TIMEOUT_MS),
    },
  );

  if (!startResponse.ok) {
    await safeResponseText(startResponse);
    throw new Error(`Gemini Native file upload session failed (${startResponse.status}).`);
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");

  if (!uploadUrl) {
    throw new Error("Gemini Native file upload did not return an upload URL.");
  }
  if (fetchImpl === fetch) await assertSafeAIProviderBaseUrl(uploadUrl);

  executionObserver?.recordNetworkRequest("file_upload_finalize");
  const uploadResponse = await fetchImpl(uploadUrl, {
    body: pdfBytesToBlob(pdfBytes),
    headers: {
      "Content-Length": String(pdfBytes.byteLength),
      "Content-Type": GEMINI_PDF_MIME_TYPE,
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
    method: "POST",
    redirect: "error",
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
  executionObserver,
  fetchImpl,
  file,
  maxPollAttempts,
  pollDelayMs,
}: {
  apiKey: string;
  baseUrl: string;
  executionObserver?: AIProviderExecutionObserver;
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

    executionObserver?.recordNetworkRequest("file_status_poll");
    const response = await fetchImpl(fileResourceUrl(current.name, baseUrl), {
      headers: {
        "X-Goog-Api-Key": apiKey,
      },
      method: "GET",
      redirect: "error",
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
  executionObserver,
  fetchImpl,
  file,
}: {
  apiKey: string;
  baseUrl: string;
  executionObserver?: AIProviderExecutionObserver;
  fetchImpl: GeminiFetch;
  file: GeminiFile | null;
}) {
  if (!file?.name) {
    return;
  }

  let cleanupSucceeded = false;
  try {
    executionObserver?.recordNetworkRequest("file_cleanup");
    const response = await fetchImpl(fileResourceUrl(file.name, baseUrl), {
      headers: {
        "X-Goog-Api-Key": apiKey,
      },
      method: "DELETE",
      redirect: "error",
      signal: AbortSignal.timeout(GEMINI_DELETE_TIMEOUT_MS),
    });
    cleanupSucceeded = response.ok;
  } catch {
    // Gemini Files API entries expire automatically, so cleanup failure should
    // not mask the import result or leak provider implementation details.
  } finally {
    executionObserver?.recordCleanupResult?.(cleanupSucceeded);
  }
}

async function generateContent({
  apiKey,
  baseUrl,
  debugContext,
  executionObserver,
  fetchImpl,
  parts,
  model,
  outputContract,
}: {
  apiKey: string;
  baseUrl: string;
  debugContext?: Record<string, unknown>;
  executionObserver?: AIProviderExecutionObserver;
  fetchImpl: GeminiFetch;
  parts: Record<string, unknown>[];
  model: string;
  outputContract?: GeminiOutputContract;
}) {
  const requestBody = {
    contents: [
      {
        parts,
      },
    ],
    generationConfig: buildGeminiGenerationConfig({
      maxOutputTokens: executionObserver?.maxOutputTokens ?? undefined,
      outputContract,
    }),
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
    executionObserver?.recordNetworkRequest("inference");
    response = await fetchImpl(
      generateContentUrl(model, baseUrl),
      {
        body: JSON.stringify(requestBody),
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        method: "POST",
        redirect: "error",
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
        name: error instanceof Error ? error.name : "UnknownError",
      },
    });
    throw error;
  }
  if (!response.ok) {
    const safeDetails = parseGeminiNativeSafeErrorDetails({
      responseText: await safeResponseText(response.clone()),
      statusCode: response.status,
    });
    await writeAIImportLLMDebugLog({
      context: {
        ...debugContext,
        adapter: "gemini_native",
        model,
      },
      event: "error",
      payload: {
        detailTypes: safeDetails.detailTypes,
        fieldViolationPaths: safeDetails.fieldViolationPaths,
        providerStatus: safeDetails.providerStatus,
        status: response.status,
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

  const usageMetadata = payload.usageMetadata;
  const candidateOutputTokens =
    typeof usageMetadata?.candidatesTokenCount === "number"
      ? usageMetadata.candidatesTokenCount
      : null;
  const thoughtTokens =
    typeof usageMetadata?.thoughtsTokenCount === "number"
      ? usageMetadata.thoughtsTokenCount
      : null;
  const usage: GeminiNativeUsage | null = usageMetadata
    ? {
        cachedInputTokens:
          typeof usageMetadata.cachedContentTokenCount === "number"
            ? usageMetadata.cachedContentTokenCount
            : null,
        inputTokens:
          typeof usageMetadata.promptTokenCount === "number"
            ? usageMetadata.promptTokenCount
            : null,
        candidateOutputTokens,
        outputTokens:
          candidateOutputTokens !== null || thoughtTokens !== null
            ? (candidateOutputTokens ?? 0) + (thoughtTokens ?? 0)
            : null,
        thoughtTokens,
        totalTokens:
          typeof usageMetadata.totalTokenCount === "number"
            ? usageMetadata.totalTokenCount
            : null,
      }
    : null;

  return { text, usage };
}

export async function generateWithGeminiNativePdf({
  apiKey,
  baseUrl = DEFAULT_GEMINI_API_BASE_URL,
  debugContext,
  executionObserver,
  fetchImpl = fetch,
  fileName,
  maxPollAttempts = DEFAULT_MAX_POLL_ATTEMPTS,
  model,
  outputContract,
  pdfBytes,
  pollDelayMs = DEFAULT_POLL_DELAY_MS,
  prompt,
}: GeminiNativePdfInput): Promise<{ text: string; usage: GeminiNativeUsage | null }> {
  assertGeminiConfig({ apiKey, model, pdfBytes });
  if (fetchImpl === fetch) await assertSafeAIProviderBaseUrl(baseUrl);
  const inputBytes =
    new TextEncoder().encode(prompt).byteLength +
    new TextEncoder().encode(JSON.stringify(outputContract ?? {})).byteLength +
    pdfBytes.byteLength +
    4_096;
  executionObserver?.beforeInference("ai_pdf_extraction", inputBytes);

  let uploadedFile: GeminiFile | null = null;

  try {
    uploadedFile = await uploadGeminiFile({
      apiKey,
      baseUrl,
      displayName: safeDisplayName(fileName),
      executionObserver,
      fetchImpl,
      pdfBytes,
    });
    const activeFile = await waitForGeminiFile({
      apiKey,
      baseUrl,
      executionObserver,
      fetchImpl,
      file: uploadedFile,
      maxPollAttempts,
      pollDelayMs,
    });

    if (!activeFile.uri) {
      throw new Error("Gemini Native file reference is missing a URI.");
    }

    return await generateContent({
      apiKey,
      baseUrl,
      debugContext,
      executionObserver,
      fetchImpl,
      model,
      outputContract,
      parts: [
        { text: prompt },
        {
          file_data: {
            file_uri: activeFile.uri,
            mime_type: fileMimeType(activeFile),
          },
        },
      ],
    });
  } finally {
    await deleteGeminiFile({
      apiKey,
      baseUrl,
      executionObserver,
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
  outputContract = { mode: "text" },
  prompt = "Return exactly: ok",
}: GeminiNativeTextTestInput): Promise<{ message: string; ok: true }> {
  assertGeminiTextConfig({ apiKey, model });
  if (fetchImpl === fetch) await assertSafeAIProviderBaseUrl(baseUrl);
  await generateContent({
    apiKey,
    baseUrl,
    fetchImpl,
    model,
    outputContract,
    parts: [{ text: prompt }],
  });

  return {
    message: "Gemini Native connection test passed.",
    ok: true as const,
  };
}

export async function generateWithGeminiNativeText({
  apiKey,
  baseUrl = DEFAULT_GEMINI_API_BASE_URL,
  debugContext,
  executionObserver,
  fetchImpl = fetch,
  model,
  outputContract,
  prompt,
}: GeminiNativeTextTestInput & {
  debugContext?: Record<string, unknown>;
  prompt: string;
}): Promise<{ text: string; usage: GeminiNativeUsage | null }> {
  assertGeminiTextConfig({ apiKey, model });
  if (fetchImpl === fetch) await assertSafeAIProviderBaseUrl(baseUrl);
  executionObserver?.beforeInference("blueprint_generation");

  return generateContent({
    apiKey,
    baseUrl,
    debugContext,
    executionObserver,
    fetchImpl,
    model,
    outputContract,
    parts: [{ text: prompt }],
  });
}
