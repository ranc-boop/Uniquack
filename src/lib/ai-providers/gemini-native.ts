import "server-only";

import {
  attachAIProviderUsageAccounting,
  buildAIProviderUsageAccounting,
  normalizeAIProviderPromptTokenDetails,
  normalizeAIProviderUsage,
  type AIProviderUsage,
  type AIProviderUsageAccounting,
} from "@/lib/ai-operations/provider-usage";
import type { AIProviderExecutionObserver } from "@/lib/ai-providers/execution-budget";
import type { AIProviderErrorOperation } from "@/lib/ai-providers/errors";
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
    promptTokensDetails?: {
      modality?: string;
      tokenCount?: number;
    }[];
    thoughtsTokenCount?: number;
    toolUsePromptTokenCount?: number;
    totalTokenCount?: number;
  };
};

type GeminiGenerateContentRequest = {
  contents: {
    parts: Record<string, unknown>[];
  }[];
  generationConfig: ReturnType<typeof buildGeminiGenerationConfig>;
};

type GeminiCountTokensResponse = {
  cachedContentTokenCount?: number;
  promptTokensDetails?: {
    modality?: string;
    tokenCount?: number;
  }[];
  totalTokens?: number;
};

export type GeminiNativeUsage = AIProviderUsage;

export type GeminiCountTokensMode = "best_effort" | "off" | "required";

export type GeminiNativeSerializedRequest = {
  serializedRequestBytes: number;
  sourceInputBytes: number;
};

type GeminiNativePdfInput = {
  apiKey: string;
  baseUrl?: string;
  countTokensMode?: GeminiCountTokensMode;
  debugContext?: Record<string, unknown>;
  executionObserver?: AIProviderExecutionObserver;
  fetchImpl?: GeminiFetch;
  fileName: string;
  maxPollAttempts?: number;
  model: string;
  onSerializedRequest?: (
    request: GeminiNativeSerializedRequest,
  ) => Promise<void> | void;
  outputContract?: GeminiOutputContract;
  pdfBytes: Uint8Array | Buffer;
  pollDelayMs?: number;
  prompt: string;
};

type GeminiNativeTextTestInput = {
  apiKey: string;
  baseUrl?: string;
  countTokensMode?: GeminiCountTokensMode;
  executionObserver?: AIProviderExecutionObserver;
  fetchImpl?: GeminiFetch;
  model: string;
  onSerializedRequest?: (
    request: GeminiNativeSerializedRequest,
  ) => Promise<void> | void;
  operation?: AIProviderErrorOperation;
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

function countTokensUrl(model: string, baseUrl: string) {
  return `${geminiApiBaseUrl(baseUrl)}/v1beta/models/${modelPath(
    model,
  )}:countTokens`;
}

function geminiModelResourceName(model: string) {
  const normalized = model.trim().replace(/^models\//i, "");
  return `models/${normalized}`;
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

async function countGeminiTokens({
  apiKey,
  baseUrl,
  executionObserver,
  fetchImpl,
  mode,
  model,
  requestBody,
}: {
  apiKey: string;
  baseUrl: string;
  executionObserver?: AIProviderExecutionObserver;
  fetchImpl: GeminiFetch;
  mode: GeminiCountTokensMode;
  model: string;
  requestBody: GeminiGenerateContentRequest;
}) {
  if (mode === "off") return null;

  const body = JSON.stringify({
    generateContentRequest: {
      ...requestBody,
      model: geminiModelResourceName(model),
    },
  });
  executionObserver?.recordNetworkRequest("token_count");

  try {
    const response = await fetchImpl(countTokensUrl(model, baseUrl), {
      body,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(GEMINI_GENERATE_TIMEOUT_MS),
    });
    const payload = await readJson<GeminiCountTokensResponse>(
      response,
      "countTokens",
    );

    return {
      cachedInputTokens:
        typeof payload.cachedContentTokenCount === "number"
          ? payload.cachedContentTokenCount
          : null,
      inputTokens:
        typeof payload.totalTokens === "number" ? payload.totalTokens : null,
      promptTokensDetails: normalizeAIProviderPromptTokenDetails(
        payload.promptTokensDetails,
      ),
    };
  } catch (error) {
    if (mode === "required") throw error;
    return null;
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
  const startBody = JSON.stringify({
    file: {
      display_name: displayName,
    },
  });
  executionObserver?.recordNetworkRequest("file_upload_start");
  const startResponse = await fetchImpl(
    `${geminiApiBaseUrl(baseUrl)}/upload/v1beta/files`,
    {
      body: startBody,
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

  return {
    file,
    serializedRequestBytes:
      Buffer.byteLength(startBody, "utf8") + pdfBytes.byteLength,
  };
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
  countTokensMode,
  debugContext,
  executionObserver,
  fetchImpl,
  localContextRequestPrefixBytes,
  localContextSourceInputBytes,
  parts,
  model,
  onSerializedRequest,
  outputContract,
}: {
  apiKey: string;
  baseUrl: string;
  countTokensMode: GeminiCountTokensMode;
  debugContext?: Record<string, unknown>;
  executionObserver?: AIProviderExecutionObserver;
  fetchImpl: GeminiFetch;
  localContextRequestPrefixBytes: number;
  localContextSourceInputBytes: number;
  parts: Record<string, unknown>[];
  model: string;
  onSerializedRequest?: (serializedRequestBytes: number) => Promise<void> | void;
  outputContract?: GeminiOutputContract;
}) {
  const requestBody: GeminiGenerateContentRequest = {
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
  const serializedRequestBody = JSON.stringify(requestBody);
  const serializedRequestBytes = Buffer.byteLength(
    serializedRequestBody,
    "utf8",
  );
  await onSerializedRequest?.(
    serializedRequestBytes,
  );
  const localContextBytes = {
    serializedRequestBytes:
      localContextRequestPrefixBytes + serializedRequestBytes,
    sourceInputBytes: localContextSourceInputBytes,
  };
  let providerCountTokens: Awaited<ReturnType<typeof countGeminiTokens>> = null;
  try {
    providerCountTokens = await countGeminiTokens({
      apiKey,
      baseUrl,
      executionObserver,
      fetchImpl,
      mode: countTokensMode,
      model,
      requestBody,
    });
  } catch (error) {
    throw attachAIProviderUsageAccounting(
      error,
      buildAIProviderUsageAccounting({
        localContextBytes,
      }),
    );
  }
  const usageAccounting = (providerReportedUsage?: unknown) =>
    buildAIProviderUsageAccounting({
      countTokens: providerCountTokens,
      localContextBytes,
      providerReportedUsage,
    });

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
        body: serializedRequestBody,
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
    throw attachAIProviderUsageAccounting(error, usageAccounting());
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
  let payload: GeminiGenerateResponse;
  try {
    payload = await readJson<GeminiGenerateResponse>(
      response,
      "generateContent",
    );
  } catch (error) {
    throw attachAIProviderUsageAccounting(error, usageAccounting());
  }
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
  const providerUsage = normalizeAIProviderUsage(payload.usageMetadata);
  const accounting = usageAccounting(providerUsage);
  const text = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text)
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n\n")
    .trim();

  if (!text) {
    const error = new Error(
      "Gemini Native response did not include text content.",
    );
    throw attachAIProviderUsageAccounting(error, accounting);
  }

  return {
    serializedRequestBytes,
    text,
    usage: providerUsage,
    usageAccounting: accounting,
  };
}

export async function generateWithGeminiNativePdf({
  apiKey,
  baseUrl = DEFAULT_GEMINI_API_BASE_URL,
  countTokensMode = "off",
  debugContext,
  executionObserver,
  fetchImpl = fetch,
  fileName,
  maxPollAttempts = DEFAULT_MAX_POLL_ATTEMPTS,
  model,
  onSerializedRequest,
  outputContract,
  pdfBytes,
  pollDelayMs = DEFAULT_POLL_DELAY_MS,
  prompt,
}: GeminiNativePdfInput): Promise<{
  serializedRequestBytes: number;
  text: string;
  usage: GeminiNativeUsage | null;
  usageAccounting: AIProviderUsageAccounting;
}> {
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
    const upload = await uploadGeminiFile({
      apiKey,
      baseUrl,
      displayName: safeDisplayName(fileName),
      executionObserver,
      fetchImpl,
      pdfBytes,
    });
    uploadedFile = upload.file;
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
      countTokensMode,
      debugContext,
      executionObserver,
      fetchImpl,
      localContextRequestPrefixBytes: upload.serializedRequestBytes,
      localContextSourceInputBytes: pdfBytes.byteLength,
      model,
      onSerializedRequest: async (generateRequestBytes) => {
        await onSerializedRequest?.({
          serializedRequestBytes:
            upload.serializedRequestBytes + generateRequestBytes,
          sourceInputBytes: pdfBytes.byteLength,
        });
      },
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
    countTokensMode: "off",
    fetchImpl,
    localContextRequestPrefixBytes: 0,
    localContextSourceInputBytes: 0,
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
  countTokensMode = "off",
  debugContext,
  executionObserver,
  fetchImpl = fetch,
  model,
  operation = "blueprint_generation",
  onSerializedRequest,
  outputContract,
  prompt,
}: GeminiNativeTextTestInput & {
  debugContext?: Record<string, unknown>;
  prompt: string;
}): Promise<{
  serializedRequestBytes: number;
  text: string;
  usage: GeminiNativeUsage | null;
  usageAccounting: AIProviderUsageAccounting;
}> {
  assertGeminiTextConfig({ apiKey, model });
  if (fetchImpl === fetch) await assertSafeAIProviderBaseUrl(baseUrl);
  executionObserver?.beforeInference(operation);

  return generateContent({
    apiKey,
    baseUrl,
    countTokensMode,
    debugContext,
    executionObserver,
    fetchImpl,
    localContextRequestPrefixBytes: 0,
    localContextSourceInputBytes: 0,
    model,
    onSerializedRequest: async (serializedRequestBytes) => {
      await onSerializedRequest?.({
        serializedRequestBytes,
        sourceInputBytes: 0,
      });
    },
    outputContract,
    parts: [{ text: prompt }],
  });
}
