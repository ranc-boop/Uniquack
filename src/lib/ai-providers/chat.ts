import "server-only";

import {
  attachAIProviderUsageAccounting,
  buildAIProviderUsageAccounting,
  normalizeAIProviderUsage,
  readAIProviderUsageAccountingFromError,
} from "@/lib/ai-operations/provider-usage";
import {
  normalizeAIPdfExtractionResponse,
  type AIPdfExtraction,
} from "@/lib/ai-pdf-import/schema";
import type {
  AIPdfAttemptFailureCategory,
  AIPdfAttemptReason,
  AIPdfCandidateMetrics,
  AIPdfQualityObservatory,
  AIPdfSerializedRequestContext,
} from "@/lib/ai-pdf-import/quality-observatory";
import type { AIProviderExecutionObserver } from "@/lib/ai-providers/execution-budget";
import {
  classifyAIProviderError,
  isAIProviderError,
} from "@/lib/ai-providers/errors";
import {
  assertMockAIProviderAllowed,
  isMockAIProviderUrl,
} from "@/lib/ai-providers/mock";
import { parsePossiblyMalformedJson } from "@/lib/ai-providers/json-repair";
import { writeAIImportLLMDebugLog } from "@/lib/ai-providers/llm-debug-logs";
import {
  AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE,
  inferAiProviderMode,
  type AiPdfInputStrategy,
} from "@/lib/ai-providers/adapters";
import { assertSafeAIProviderBaseUrl } from "@/lib/ai-providers/network-safety";
import {
  AIProviderResponseTooLargeError,
  readResponseJsonWithLimit,
  readResponseTextWithLimit,
} from "@/lib/ai-providers/response-limits";
import {
  generateWithGeminiNativePdf,
  generateWithGeminiNativeText,
  testGeminiNativeTextConnection,
  type GeminiNativeUsage,
} from "@/lib/ai-providers/gemini-native";
import { GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT } from "@/lib/ai-providers/gemini-structured-output";
import {
  aiPdfProviderRetryReason,
  createAIPdfProviderAttemptLedger,
  recordAIPdfProviderInference,
  reserveAIPdfSourceRecovery,
  reserveAIPdfStructuralRepair,
  type AIPdfProviderAttemptLedger,
  type AIPdfProviderAttemptReason,
} from "@/lib/ai-providers/ai-pdf-attempt-state";
import {
  runWithAIProviderRetry,
  type AIProviderRetryEvent,
} from "@/lib/ai-providers/resilience";

type ProviderProfileForUse = {
  apiKey: string;
  base_url: string;
  model: string;
  name: string;
  provider: string;
  supports_pdf_input: boolean;
  supports_vision_images: boolean;
};

type ProviderInput = {
  attemptLedger?: AIPdfProviderAttemptLedger;
  attemptScope?: string;
  debugContext?: Record<string, unknown>;
  executionObserver?: AIProviderExecutionObserver;
  fileName: string;
  inputStrategy: AiPdfInputStrategy;
  pageImageDataUrls: string[];
  pdfBase64: string;
  pdfBytes: Buffer;
  prompt: string;
  promptContext: Pick<
    AIPdfSerializedRequestContext,
    | "extractionInstructionBytes"
    | "structuredSchemaBytes"
    | "taxonomyCandidateBytes"
  >;
  profile: ProviderProfileForUse;
  providerRetryMaxAttempts?: number;
  qualityObserver?: AIPdfQualityObservatory;
  routeCandidateIndex?: number;
  onAttemptLedgerCheckpoint?: (
    ledger: AIPdfProviderAttemptLedger,
  ) => Promise<void>;
  onProviderRetry?: (event: AIProviderRetryEvent) => Promise<void> | void;
  onProviderUsage?: (usage: GeminiNativeUsage | null) => void;
};

type ChatMessage = {
  content: unknown;
  role: "assistant" | "user";
};

const MAX_EXTRACTION_ATTEMPTS = 2;
const MAX_REPAIR_RESPONSE_CHARS = 60_000;
const CHAT_COMPLETION_TIMEOUT_MS = 180_000;
const CONNECTION_TEST_TIMEOUT_MS = 15_000;
const EXTRACTION_RESPONSE_MAX_BYTES = 8 * 1024 * 1024;
const CONNECTION_RESPONSE_MAX_BYTES = 64 * 1024;

class AIPdfExtractionValidationError extends Error {
  readonly kind: AIPdfAttemptFailureCategory;

  constructor(kind: AIPdfAttemptFailureCategory, message: string) {
    super(message);
    this.kind = kind;
    this.name = "AIPdfExtractionValidationError";
  }
}

function preservePriorValidationError({
  error,
  lastError,
}: {
  error: unknown;
  lastError: unknown;
}): never {
  if (
    lastError &&
    isAIProviderError(error) &&
    error.code === "provider_execution_budget_exhausted" &&
    error.operation === "ai_pdf_extraction"
  ) {
    throw lastError;
  }
  throw error;
}

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function responsePreview(value: string) {
  return htmlToText(value).replace(/\s+/g, " ").trim().slice(0, 1200);
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function htmlToText(value: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(value)?.[1];
  const body = value
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const text = title ? `${title}. ${body}` : body;

  return decodeBasicHtmlEntities(text);
}

function isCloudflareTimeout(status: number, preview: string) {
  return status === 524 || /524:\s*a timeout occurred/i.test(preview);
}

function providerHttpErrorMessage({
  body,
  operation,
  profile,
  status,
}: {
  body: string;
  operation: "request" | "test";
  profile: Pick<ProviderProfileForUse, "base_url" | "model" | "name">;
  status: number;
}) {
  const preview = responsePreview(body);
  const providerLabel = `${profile.name} / ${profile.model}`;

  if (isCloudflareTimeout(status, preview)) {
    return `AI provider ${operation} timed out at the provider gateway (524) for ${providerLabel}. Retry later, switch provider, or import a smaller PDF if this keeps happening.`;
  }

  if (status >= 500) {
    return `AI provider ${operation} failed with upstream server error (${status}) for ${providerLabel}.`;
  }

  return `AI provider ${operation} failed (${status}) for ${providerLabel}.`;
}

function providerNetworkErrorMessage({
  error,
  operation,
  profile,
  timeoutMs,
}: {
  error: unknown;
  operation: "request" | "test";
  profile: Pick<ProviderProfileForUse, "base_url" | "model" | "name">;
  timeoutMs: number;
}) {
  const providerLabel = `${profile.name} / ${profile.model}`;

  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return `AI provider ${operation} timed out locally after ${Math.round(
      timeoutMs / 1000,
    )}s for ${providerLabel}. Retry later, switch provider/base URL, or reduce the PDF size.`;
  }

  return `AI provider ${operation} failed because of a network error for ${providerLabel}.`;
}

function repairContext(value: string) {
  return value.length > MAX_REPAIR_RESPONSE_CHARS
    ? `${value.slice(0, MAX_REPAIR_RESPONSE_CHARS)}\n\n[truncated]`
    : value;
}

function schemaIssueSummary(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unknown schema validation error.";
  }

  return error.message;
}

function parseExtractionContent(contentText: string) {
  let parsed: unknown;

  try {
    parsed = parsePossiblyMalformedJson(contentText);
  } catch {
    throw new AIPdfExtractionValidationError(
      "non_json",
      "AI provider returned non-JSON content.",
    );
  }

  try {
    const extraction = normalizeAIPdfExtractionResponse(parsed);
    const record =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    const rawCandidates = Array.isArray(parsed)
      ? parsed.length
      : Array.isArray(record?.questions)
        ? record.questions.length
        : Array.isArray(record?.items)
          ? record.items.length
          : 0;
    const output: AIPdfCandidateMetrics = {
      applicationValidCandidates: extraction.questions.length,
      rawCandidates,
      rejectedCandidates: Math.max(0, rawCandidates - extraction.questions.length),
      schemaValidCandidates: extraction.questions.length,
      warningCount: extraction.warnings.length,
    };

    return { extraction, output };
  } catch (error) {
    const message =
      `AI provider JSON did not match the expected import schema: ${
        error instanceof Error ? error.message : "Unknown schema validation error."
      }`;
    throw new AIPdfExtractionValidationError(
      /zero importable questions/i.test(message)
        ? "zero_importable"
        : "application_schema",
      message,
    );
  }
}

function semanticAttemptReason({
  attempt,
  attemptLedger,
  attemptScope,
  lastError,
}: {
  attempt: number;
  attemptLedger: AIPdfProviderAttemptLedger;
  attemptScope: string;
  lastError: unknown;
}): AIPdfProviderAttemptReason | null {
  if (attempt === 1) return "FIRST_ATTEMPT";
  if (!(lastError instanceof AIPdfExtractionValidationError)) return null;
  if (lastError.kind === "zero_importable") {
    return reserveAIPdfSourceRecovery(attemptLedger, attemptScope)
      ? "SOURCE_BACKED_SEMANTIC_RECOVERY"
      : null;
  }
  if (lastError.kind === "non_json") {
    return reserveAIPdfStructuralRepair(attemptLedger, attemptScope)
      ? "STRUCTURAL_SCHEMA_REPAIR"
      : null;
  }
  if (lastError.kind === "application_schema") {
    return reserveAIPdfStructuralRepair(attemptLedger, attemptScope)
      ? "APPLICATION_VALIDATION_REPAIR"
      : null;
  }
  return null;
}

function isSourceFreeRepairReason(reason: AIPdfProviderAttemptReason) {
  return (
    reason === "STRUCTURAL_SCHEMA_REPAIR" ||
    reason === "APPLICATION_VALIDATION_REPAIR"
  );
}

function attemptFailureCategory(error: unknown): AIPdfAttemptFailureCategory {
  if (error instanceof AIPdfExtractionValidationError) return error.kind;
  if (error instanceof Error && /did not include message content/i.test(error.message)) {
    return "response_missing";
  }
  return classifyAIProviderError({
    error,
    operation: "ai_pdf_extraction",
  }).code;
}

async function runAIPdfProviderTransport<T>({
  attemptLedger,
  attemptScope,
  context,
  extractionAttempt,
  inputStrategy,
  onAttemptLedgerCheckpoint,
  onProviderRetry,
  providerRetryMaxAttempts,
  qualityObserver,
  routeCandidateIndex,
  run,
  semanticReason,
  sourceIncluded,
}: {
  attemptLedger: AIPdfProviderAttemptLedger;
  attemptScope: string;
  context: Omit<
    AIPdfSerializedRequestContext,
    "serializedRequestBytes" | "sourceInputBytes"
  >;
  extractionAttempt: number;
  inputStrategy: AiPdfInputStrategy;
  onAttemptLedgerCheckpoint?: (
    ledger: AIPdfProviderAttemptLedger,
  ) => Promise<void>;
  onProviderRetry?: (event: AIProviderRetryEvent) => Promise<void> | void;
  providerRetryMaxAttempts?: number;
  qualityObserver?: AIPdfQualityObservatory;
  routeCandidateIndex: number;
  run: (callbacks: {
    onSerializedRequest: (
      serializedRequestBytes: number,
      sourceInputBytes: number,
    ) => Promise<void>;
  }) => Promise<T>;
  semanticReason: AIPdfProviderAttemptReason;
  sourceIncluded: boolean;
}) {
  let nextRetryReason: AIPdfProviderAttemptReason = semanticReason;
  const result = await runWithAIProviderRetry({
    onRetry: async (event) => {
      nextRetryReason = aiPdfProviderRetryReason(event.error.safeErrorCode);
      await onProviderRetry?.(event);
    },
    operation: "ai_pdf_extraction",
    policy: providerRetryMaxAttempts
      ? { maxAttempts: providerRetryMaxAttempts }
      : undefined,
    run: async ({ attemptCount }) => {
      let recorder: ReturnType<NonNullable<typeof qualityObserver>["beginAttempt"]> | undefined;
      const primaryReason = attemptCount === 1
        ? semanticReason
        : nextRetryReason;

      try {
        const value = await run({
          onSerializedRequest: async (
            serializedRequestBytes,
            sourceInputBytes,
          ) => {
            if (recorder) {
              throw new Error("AI PDF Provider transport serialized more than one inference request.");
            }
            const sourceRepeated =
              sourceIncluded && attemptLedger.sourceInferenceCount > 0;
            const inferenceOrdinal = recordAIPdfProviderInference(
              attemptLedger,
              {
                primaryReason,
                routeCandidateIndex,
                scope: attemptScope,
                sourceIncluded,
                transportAttempt: attemptCount,
              },
            );
            await onAttemptLedgerCheckpoint?.(attemptLedger);
            recorder = qualityObserver?.beginAttempt({
              context: {
                ...context,
                serializedRequestBytes,
                sourceInputBytes,
              },
              extractionAttempt,
              inferenceOrdinal,
              inputStrategy,
              reason: primaryReason,
              routeCandidateIndex,
              scope: attemptScope,
              sourceIncluded,
              sourceRepeated,
              transportAttempt: attemptCount,
            });
          },
        });
        return { recorder, value };
      } catch (error) {
        const usageAccounting = readAIProviderUsageAccountingFromError(error);
        recorder?.complete({
          failureCategory: attemptFailureCategory(error),
          outcome: "failed",
          usage:
            usageAccounting?.providerReportedUsage?.usage ?? null,
          usageAccounting,
        });
        throw error;
      }
    },
  });

  return result.value;
}

async function readProviderJsonWithLimit<T>(response: Response, maxBytes: number) {
  try {
    return await readResponseJsonWithLimit<T>(response, maxBytes);
  } catch (error) {
    if (error instanceof AIProviderResponseTooLargeError) {
      throw error;
    }

    throw new Error("AI provider returned invalid JSON.");
  }
}

async function requestChatCompletion({
  debugContext,
  executionObserver,
  messages,
  onSerializedRequest,
  profile,
  sourceInputBytes,
}: {
  debugContext?: Record<string, unknown>;
  executionObserver?: AIProviderExecutionObserver;
  messages: ChatMessage[];
  onSerializedRequest?: (serializedRequestBytes: number) => Promise<void> | void;
  profile: ProviderProfileForUse;
  sourceInputBytes: number;
}) {
  let response: Response;
  const requestBody = {
    ...(executionObserver?.maxOutputTokens
      ? { max_tokens: executionObserver.maxOutputTokens }
      : {}),
    messages,
    model: profile.model,
    response_format: { type: "json_object" },
    temperature: 0.1,
  };
  const serializedRequestBody = JSON.stringify(requestBody);
  const localContextBytes = {
    serializedRequestBytes: Buffer.byteLength(serializedRequestBody, "utf8"),
    sourceInputBytes,
  };
  await onSerializedRequest?.(
    Buffer.byteLength(serializedRequestBody, "utf8"),
  );

  await writeAIImportLLMDebugLog({
    context: {
      ...debugContext,
      adapter: "openai_compatible_chat",
      model: profile.model,
      provider: profile.provider,
      providerName: profile.name,
    },
    event: "request",
    payload: {
      body: requestBody,
      endpoint: endpoint(profile.base_url),
      headers: {
        Authorization: "Bearer [redacted]",
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  });

  try {
    await assertSafeAIProviderBaseUrl(profile.base_url);
    executionObserver?.beforeInference("ai_pdf_extraction");
    executionObserver?.recordNetworkRequest("inference");
    response = await fetch(endpoint(profile.base_url), {
      body: serializedRequestBody,
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(CHAT_COMPLETION_TIMEOUT_MS),
    });
  } catch (error) {
    await writeAIImportLLMDebugLog({
      context: {
        ...debugContext,
        adapter: "openai_compatible_chat",
        model: profile.model,
        provider: profile.provider,
        providerName: profile.name,
      },
      event: "error",
      payload: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "UnknownError",
      },
    });
    const networkError = new Error(
      providerNetworkErrorMessage({
        error,
        operation: "request",
        profile,
        timeoutMs: CHAT_COMPLETION_TIMEOUT_MS,
      }),
    );
    throw attachAIProviderUsageAccounting(
      networkError,
      buildAIProviderUsageAccounting({ localContextBytes }),
    );
  }

  if (!response.ok) {
    const text = await readResponseTextWithLimit(response, CONNECTION_RESPONSE_MAX_BYTES);
    await writeAIImportLLMDebugLog({
      context: {
        ...debugContext,
        adapter: "openai_compatible_chat",
        model: profile.model,
        provider: profile.provider,
        providerName: profile.name,
      },
      event: "error",
      payload: {
        body: text,
        status: response.status,
        statusText: response.statusText,
      },
    });
    const providerError = new Error(
      providerHttpErrorMessage({
        body: text,
        operation: "request",
        profile,
        status: response.status,
      }),
    );
    throw attachAIProviderUsageAccounting(
      providerError,
      buildAIProviderUsageAccounting({ localContextBytes }),
    );
  }

  let payload: {
    choices?: { message?: { content?: string } }[];
    usage?: {
      completion_tokens?: number;
      prompt_tokens?: number;
      total_tokens?: number;
    };
  };
  try {
    payload = await readProviderJsonWithLimit(
      response,
      EXTRACTION_RESPONSE_MAX_BYTES,
    );
  } catch (error) {
    throw attachAIProviderUsageAccounting(
      error,
      buildAIProviderUsageAccounting({ localContextBytes }),
    );
  }
  await writeAIImportLLMDebugLog({
    context: {
      ...debugContext,
      adapter: "openai_compatible_chat",
      model: profile.model,
      provider: profile.provider,
      providerName: profile.name,
    },
    event: "response",
    payload: {
      body: payload,
      status: response.status,
      statusText: response.statusText,
    },
  });
  const contentText = payload.choices?.[0]?.message?.content;
  const usage = normalizeAIProviderUsage(payload.usage);
  const usageAccounting = buildAIProviderUsageAccounting({
    localContextBytes,
    providerReportedUsage: usage,
  });

  if (!contentText) {
    const error = new Error(
      "AI provider response did not include message content.",
    );
    throw attachAIProviderUsageAccounting(error, usageAccounting);
  }

  return {
    serializedRequestBytes: localContextBytes.serializedRequestBytes,
    text: contentText,
    usage,
    usageAccounting,
  };
}

function buildRepairInstruction({
  error,
  sourceBacked,
}: {
  error: unknown;
  sourceBacked: boolean;
}) {
  return [
    "Your previous answer could not be imported because it did not match the required JSON schema.",
    "Keep the same extracted questions, tags, page references, solutions, and asset placeholder intent from your previous answer.",
    sourceBacked
      ? "The authoritative source is attached again for one bounded semantic recovery. Re-read it using the original extraction instructions and return only genuinely supported questions."
      : "Repair only the JSON structure and field values. The source is intentionally not resent for this structural repair.",
    "When the PDF contains an actual question, return at least one question with a non-empty title and a non-empty content_html value containing the complete visible prompt.",
    "Do not return blank strings for required fields. Do not replace a visible source question with a heading, warning, or empty placeholder.",
    "",
    "Required output shape:",
    '{"questions":[{"title":"...","question_number":"...","question_type":"mcq|fill_blank|frq|mixed","difficulty_rating":500,"content_html":"...","content_source":"...","solution_html":"...","solution_source":"...","options":[],"answer_spec":{},"tag_ids":[],"page_refs":[1],"asset_placeholders":[]}],"warnings":[]}',
    "",
    "Validation error:",
    schemaIssueSummary(error),
    "",
    "Return ONLY corrected JSON. Do not wrap in markdown.",
  ].join("\n");
}

function buildGeminiRepairPrompt({
  originalPrompt,
  previousResponse,
  repairInstruction,
  sourceBacked,
}: {
  originalPrompt: string;
  previousResponse: string;
  repairInstruction: string;
  sourceBacked: boolean;
}) {
  return [
    sourceBacked ? originalPrompt : "",
    repairInstruction,
    "",
    "Previous answer:",
    repairContext(previousResponse),
  ].filter(Boolean).join("\n");
}

function mockExtraction(): AIPdfExtraction {
  return {
    questions: [
      {
        asset_placeholders: [],
        answer_spec: { kind: "frq", grading_mode: "manual_or_ai" },
        content_html: "<p>Mock AI PDF import content.</p>",
        content_source: "Mock AI PDF import content.",
        difficulty_rating: 500,
        options: [],
        page_refs: [1],
        question_code: "AI-PDF-MOCK-1",
        question_type: "frq",
        solution_html: "<p>Mock AI PDF import solution.</p>",
        solution_source: "Mock AI PDF import solution.",
        tag_ids: [],
        title: "Mock AI PDF import question",
        visual_evidence_required: false,
      },
    ],
    warnings: ["Mock provider response used."],
  };
}

export async function testAIProviderConnection(
  profile: Pick<
    ProviderProfileForUse,
    "apiKey" | "base_url" | "model" | "name" | "provider"
  >,
) {
  if (isMockAIProviderUrl(profile.base_url)) {
    assertMockAIProviderAllowed();

    return {
      message: `Mock provider ${profile.name} is reachable.`,
      ok: true as const,
    };
  }

  if (inferAiProviderMode(profile) === "gemini_native") {
    return testGeminiNativeTextConnection({
      apiKey: profile.apiKey,
      baseUrl: profile.base_url,
      model: profile.model,
    });
  }

  let response: Response;

  try {
    await assertSafeAIProviderBaseUrl(profile.base_url);
    response = await fetch(endpoint(profile.base_url), {
      body: JSON.stringify({
        max_tokens: 8,
        messages: [
          {
            content: "Connection test. Reply with OK.",
            role: "user",
          },
        ],
        model: profile.model,
        temperature: 0,
      }),
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(CONNECTION_TEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      providerNetworkErrorMessage({
        error,
        operation: "test",
        profile,
        timeoutMs: CONNECTION_TEST_TIMEOUT_MS,
      }),
    );
  }

  if (!response.ok) {
    const text = await readResponseTextWithLimit(response, CONNECTION_RESPONSE_MAX_BYTES);
    throw new Error(
      providerHttpErrorMessage({
        body: text,
        operation: "test",
        profile,
        status: response.status,
      }),
    );
  }

  await readProviderJsonWithLimit<{
    choices?: { message?: { content?: string } }[];
  }>(response, CONNECTION_RESPONSE_MAX_BYTES);

  return {
    message: "Connection test succeeded.",
    ok: true as const,
  };
}

export async function callAIPdfExtractionProvider({
  attemptLedger = createAIPdfProviderAttemptLedger(),
  attemptScope = "single",
  debugContext,
  executionObserver,
  fileName,
  inputStrategy,
  pageImageDataUrls,
  pdfBase64,
  pdfBytes,
  profile,
  prompt,
  promptContext,
  providerRetryMaxAttempts,
  qualityObserver,
  routeCandidateIndex = 0,
  onAttemptLedgerCheckpoint,
  onProviderRetry,
  onProviderUsage,
}: ProviderInput) {
  if (isMockAIProviderUrl(profile.base_url)) {
    assertMockAIProviderAllowed();

    return mockExtraction();
  }

  await writeAIImportLLMDebugLog({
    context: {
      ...debugContext,
      adapter: inferAiProviderMode(profile),
      fileName,
      inputStrategy,
      model: profile.model,
      provider: profile.provider,
      providerName: profile.name,
    },
    event: "provider-input-context",
    payload: {
      fileName,
      inputStrategy,
      pageImageDataUrls,
      pdfBase64,
      pdfByteLength: pdfBytes.byteLength,
      prompt,
    },
  });

  if (inputStrategy === "gemini_native_pdf") {
    let lastError: unknown = null;
    let previousResponse = "";
    let usedRepair = false;
    const schemaBytes = Buffer.byteLength(
      JSON.stringify(GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT),
      "utf8",
    );

    for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt += 1) {
      const semanticReason = semanticAttemptReason({
        attempt,
        attemptLedger,
        attemptScope,
        lastError,
      });
      if (!semanticReason) break;
      const sourceIncluded = !isSourceFreeRepairReason(semanticReason);
      const repairInstruction = attempt === 1
        ? ""
        : buildRepairInstruction({
            error: lastError,
            sourceBacked:
              semanticReason === "SOURCE_BACKED_SEMANTIC_RECOVERY",
          });
      const repairPrompt = attempt === 1
        ? prompt
        : buildGeminiRepairPrompt({
            originalPrompt: prompt,
            previousResponse,
            repairInstruction,
            sourceBacked:
              semanticReason === "SOURCE_BACKED_SEMANTIC_RECOVERY",
          });
      let transport: {
        recorder: ReturnType<NonNullable<typeof qualityObserver>["beginAttempt"]> | undefined;
        value: Awaited<ReturnType<typeof generateWithGeminiNativePdf>>;
      };
      try {
        transport = await runAIPdfProviderTransport({
          attemptLedger,
          attemptScope,
          context: {
            extractionInstructionBytes: sourceIncluded
              ? promptContext.extractionInstructionBytes
              : 0,
            previousResponseBytes: attempt > 1
              ? Buffer.byteLength(repairContext(previousResponse), "utf8")
              : 0,
            semanticRecoveryInstructionBytes:
              semanticReason === "SOURCE_BACKED_SEMANTIC_RECOVERY"
                ? Buffer.byteLength(repairInstruction, "utf8")
                : 0,
            structuralRepairInstructionBytes:
              isSourceFreeRepairReason(semanticReason)
                ? Buffer.byteLength(repairInstruction, "utf8")
                : 0,
            structuredSchemaBytes:
              (sourceIncluded ? promptContext.structuredSchemaBytes : 0) +
              schemaBytes,
            systemInstructionBytes: 0,
            taxonomyCandidateBytes: sourceIncluded
              ? promptContext.taxonomyCandidateBytes
              : 0,
          },
          extractionAttempt: attempt,
          inputStrategy,
          onAttemptLedgerCheckpoint,
          onProviderRetry,
          providerRetryMaxAttempts,
          qualityObserver,
          routeCandidateIndex,
          run: async ({ onSerializedRequest }) => {
            const common = {
              apiKey: profile.apiKey,
              baseUrl: profile.base_url,
              debugContext: {
                ...debugContext,
                attempt,
                fileName,
                inputStrategy,
                repairAttempt: attempt > 1,
                sourceIncluded,
              },
              executionObserver,
              model: profile.model,
              onSerializedRequest: (request: {
                serializedRequestBytes: number;
                sourceInputBytes: number;
              }) => onSerializedRequest(
                request.serializedRequestBytes,
                request.sourceInputBytes,
              ),
              outputContract: GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT,
              prompt: repairPrompt,
            };
            return sourceIncluded
              ? generateWithGeminiNativePdf({
                  ...common,
                  fileName,
                  pdfBytes,
                })
              : generateWithGeminiNativeText({
                  ...common,
                  operation: "ai_pdf_extraction",
                });
          },
          semanticReason,
          sourceIncluded,
        });
      } catch (error) {
        preservePriorValidationError({ error, lastError });
      }
      const nativeResponse = transport.value;
      onProviderUsage?.(nativeResponse.usage);
      const contentText = nativeResponse.text;
      await writeAIImportLLMDebugLog({
        context: {
          ...debugContext,
          adapter: "gemini_native",
          attempt,
          fileName,
          inputStrategy,
          model: profile.model,
          provider: profile.provider,
          providerName: profile.name,
          repairAttempt: attempt > 1,
        },
        event: "raw-output-text",
        payload: {
          text: contentText,
        },
      });
      previousResponse = contentText;

      try {
        const { extraction, output } = parseExtractionContent(contentText);
        transport.recorder?.complete({
          outcome: "success",
          output,
          usage: nativeResponse.usage,
          usageAccounting: nativeResponse.usageAccounting,
        });

        if (usedRepair) {
          extraction.warnings = [
            ...extraction.warnings,
            "AI provider response was repaired after schema validation failed.",
          ];
        }

        return extraction;
      } catch (error) {
        transport.recorder?.complete({
          failureCategory: attemptFailureCategory(error),
          outcome: "failed",
          usage: nativeResponse.usage,
          usageAccounting: nativeResponse.usageAccounting,
        });
        lastError = error;

        if (attempt >= MAX_EXTRACTION_ATTEMPTS) {
          break;
        }

        usedRepair = true;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("AI provider JSON did not match the expected import schema.");
  }

  const content: unknown[] = [
    {
      text: prompt,
      type: "text",
    },
  ];

  if (inputStrategy === "openai_file") {
    content.push({
      file: {
        file_data: `data:application/pdf;base64,${pdfBase64}`,
        filename: fileName,
      },
      type: "file",
    });
  } else if (inputStrategy === "page_images") {
    for (const dataUrl of pageImageDataUrls) {
      content.push({
        image_url: {
          url: dataUrl,
        },
        type: "image_url",
      });
    }
  } else {
    throw new Error(AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE);
  }

  const initialMessages: ChatMessage[] = [
    {
      content,
      role: "user",
    },
  ];
  let lastError: unknown = null;
  let previousResponse = "";
  let usedRepair = false;

  for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt += 1) {
    const semanticReason = semanticAttemptReason({
      attempt,
      attemptLedger,
      attemptScope,
      lastError,
    });
    if (!semanticReason) break;
    const sourceIncluded = !isSourceFreeRepairReason(semanticReason);
    const repairInstruction = attempt === 1
      ? ""
      : buildRepairInstruction({
          error: lastError,
          sourceBacked:
            semanticReason === "SOURCE_BACKED_SEMANTIC_RECOVERY",
        });
    const messages: ChatMessage[] =
      attempt === 1
        ? initialMessages
        : [
            ...(sourceIncluded ? initialMessages : []),
            {
              content: previousResponse,
              role: "assistant" as const,
            },
            {
              content: repairInstruction,
              role: "user" as const,
            },
          ];
    let transport: {
      recorder: ReturnType<NonNullable<typeof qualityObserver>["beginAttempt"]> | undefined;
      value: Awaited<ReturnType<typeof requestChatCompletion>>;
    };
    try {
      transport = await runAIPdfProviderTransport({
        attemptLedger,
        attemptScope,
        context: {
          extractionInstructionBytes: sourceIncluded
            ? promptContext.extractionInstructionBytes
            : 0,
          previousResponseBytes: attempt > 1
            ? Buffer.byteLength(repairContext(previousResponse), "utf8")
            : 0,
          semanticRecoveryInstructionBytes:
            semanticReason === "SOURCE_BACKED_SEMANTIC_RECOVERY"
              ? Buffer.byteLength(repairInstruction, "utf8")
              : 0,
          structuralRepairInstructionBytes:
            isSourceFreeRepairReason(semanticReason)
              ? Buffer.byteLength(repairInstruction, "utf8")
              : 0,
          structuredSchemaBytes: sourceIncluded
            ? promptContext.structuredSchemaBytes
            : 0,
          systemInstructionBytes: 0,
          taxonomyCandidateBytes: sourceIncluded
            ? promptContext.taxonomyCandidateBytes
            : 0,
        },
        extractionAttempt: attempt,
        inputStrategy,
        onAttemptLedgerCheckpoint,
        onProviderRetry,
        providerRetryMaxAttempts,
        qualityObserver,
        routeCandidateIndex,
        run: ({ onSerializedRequest }) =>
          requestChatCompletion({
            debugContext: {
              ...debugContext,
              attempt,
              fileName,
              inputStrategy,
              repairAttempt: attempt > 1,
              sourceIncluded,
            },
            executionObserver,
            messages,
            onSerializedRequest: (serializedRequestBytes) =>
              onSerializedRequest(
                serializedRequestBytes,
                sourceIncluded ? pdfBytes.byteLength : 0,
              ),
            profile,
            sourceInputBytes: sourceIncluded ? pdfBytes.byteLength : 0,
          }),
        semanticReason,
        sourceIncluded,
      });
    } catch (error) {
      preservePriorValidationError({ error, lastError });
    }
    const response = transport.value;
    onProviderUsage?.(response.usage);
    const contentText = response.text;
    previousResponse = contentText;
    await writeAIImportLLMDebugLog({
      context: {
        ...debugContext,
        adapter: "openai_compatible_chat",
        attempt,
        fileName,
        inputStrategy,
        model: profile.model,
        provider: profile.provider,
        providerName: profile.name,
        repairAttempt: attempt > 1,
      },
      event: "raw-output-text",
      payload: {
        text: contentText,
      },
    });

    try {
      const { extraction, output } = parseExtractionContent(contentText);
      transport.recorder?.complete({
        outcome: "success",
        output,
        usage: response.usage,
        usageAccounting: response.usageAccounting,
      });

      if (usedRepair) {
        extraction.warnings = [
          ...extraction.warnings,
          "AI provider response was repaired after schema validation failed.",
        ];
      }

      return extraction;
    } catch (error) {
      transport.recorder?.complete({
        failureCategory: attemptFailureCategory(error),
        outcome: "failed",
        usage: response.usage,
        usageAccounting: response.usageAccounting,
      });
      lastError = error;

      if (attempt >= MAX_EXTRACTION_ATTEMPTS) {
        break;
      }

      usedRepair = true;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("AI provider JSON did not match the expected import schema.");
}
