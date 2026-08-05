import "server-only";

import {
  normalizeAIPdfExtractionResponse,
  type AIPdfExtraction,
} from "@/lib/ai-pdf-import/schema";
import type {
  AIPdfAttemptFailureCategory,
  AIPdfAttemptReason,
  AIPdfCandidateMetrics,
  AIPdfQualityObservatory,
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
  debugContext?: Record<string, unknown>;
  executionObserver?: AIProviderExecutionObserver;
  fileName: string;
  inputStrategy: AiPdfInputStrategy;
  pageImageDataUrls: string[];
  pdfBase64: string;
  pdfBytes: Buffer;
  prompt: string;
  profile: ProviderProfileForUse;
  qualityObserver?: AIPdfQualityObservatory;
  routeCandidateIndex?: number;
  taxonomyCatalogBytes?: number;
  transportAttempt?: number;
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

function attemptReason({
  extractionAttempt,
  lastError,
  routeCandidateIndex,
  transportAttempt,
}: {
  extractionAttempt: number;
  lastError: unknown;
  routeCandidateIndex: number;
  transportAttempt: number;
}): AIPdfAttemptReason {
  if (extractionAttempt > 1) {
    if (
      lastError instanceof AIPdfExtractionValidationError &&
      lastError.kind === "non_json"
    ) {
      return "schema_repair";
    }
    if (
      lastError instanceof AIPdfExtractionValidationError &&
      lastError.kind === "zero_importable"
    ) {
      return "source_recovery";
    }
    return "application_repair";
  }

  if (routeCandidateIndex > 0) {
    return transportAttempt > 1
      ? "fallback_transport_retry"
      : "fallback_initial";
  }

  return transportAttempt > 1 ? "transport_retry" : "initial_extraction";
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
  profile,
}: {
  debugContext?: Record<string, unknown>;
  executionObserver?: AIProviderExecutionObserver;
  messages: ChatMessage[];
  profile: ProviderProfileForUse;
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
      body: JSON.stringify(requestBody),
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
    throw new Error(
      providerNetworkErrorMessage({
        error,
        operation: "request",
        profile,
        timeoutMs: CHAT_COMPLETION_TIMEOUT_MS,
      }),
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
    throw new Error(
      providerHttpErrorMessage({
        body: text,
        operation: "request",
        profile,
        status: response.status,
      }),
    );
  }

  const payload = await readProviderJsonWithLimit<{
    choices?: { message?: { content?: string } }[];
    usage?: {
      completion_tokens?: number;
      prompt_tokens?: number;
      total_tokens?: number;
    };
  }>(response, EXTRACTION_RESPONSE_MAX_BYTES);
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

  if (!contentText) {
    throw new Error("AI provider response did not include message content.");
  }

  return {
    text: contentText,
    usage: payload.usage
      ? {
          cachedInputTokens: null,
          inputTokens: payload.usage.prompt_tokens ?? null,
          outputTokens: payload.usage.completion_tokens ?? null,
          totalTokens: payload.usage.total_tokens ?? null,
        }
      : null,
  };
}

function buildRepairPrompt({
  error,
  originalPrompt,
  previousResponse,
}: {
  error: unknown;
  originalPrompt?: string;
  previousResponse: string;
}) {
  return [
    originalPrompt ? "Original extraction instructions:" : "",
    originalPrompt ?? "",
    "",
    "Your previous answer could not be imported because it did not match the required JSON schema.",
    "Keep the same extracted questions, tags, page references, solutions, and asset placeholder intent from your previous answer.",
    "Repair the JSON structure and field values. If the previous answer contained zero importable questions but the PDF contains an actual question, extract that question now using the original instructions.",
    "When the PDF contains an actual question, return at least one question with a non-empty title and a non-empty content_html value containing the complete visible prompt.",
    "Do not return blank strings for required fields. Do not replace a visible source question with a heading, warning, or empty placeholder.",
    "",
    "Required output shape:",
    '{"questions":[{"title":"...","question_number":"...","question_type":"mcq|fill_blank|frq|mixed","difficulty_rating":500,"content_html":"...","content_source":"...","solution_html":"...","solution_source":"...","options":[],"answer_spec":{},"tag_ids":[],"page_refs":[1],"asset_placeholders":[]}],"warnings":[]}',
    "",
    "Validation error:",
    schemaIssueSummary(error),
    "",
    "Previous answer:",
    repairContext(previousResponse),
    "",
    "Return ONLY corrected JSON. Do not wrap in markdown.",
  ].join("\n");
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
  debugContext,
  executionObserver,
  fileName,
  inputStrategy,
  pageImageDataUrls,
  pdfBase64,
  pdfBytes,
  profile,
  prompt,
  qualityObserver,
  routeCandidateIndex = 0,
  taxonomyCatalogBytes = 0,
  transportAttempt = 1,
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
      const repairPrompt =
        attempt === 1
          ? prompt
          : buildRepairPrompt({
              error: lastError,
              originalPrompt:
                lastError instanceof AIPdfExtractionValidationError &&
                lastError.kind === "zero_importable"
                  ? prompt
                  : undefined,
              previousResponse,
            });
      const sourceIncluded =
        attempt === 1 ||
        (lastError instanceof AIPdfExtractionValidationError &&
          lastError.kind === "zero_importable");
      const recorder = qualityObserver?.beginAttempt({
        extractionAttempt: attempt,
        inputStrategy,
        promptBytes: Buffer.byteLength(repairPrompt, "utf8"),
        reason: attemptReason({
          extractionAttempt: attempt,
          lastError,
          routeCandidateIndex,
          transportAttempt,
        }),
        repairContextBytes:
          attempt > 1
            ? Buffer.byteLength(repairContext(previousResponse), "utf8")
            : 0,
        routeCandidateIndex,
        schemaBytes,
        sourceBytes: sourceIncluded ? pdfBytes.byteLength : 0,
        sourceIncluded,
        taxonomyCatalogBytes: attempt === 1 ? taxonomyCatalogBytes : 0,
        transportAttempt,
      });
      let nativeResponse: Awaited<ReturnType<typeof generateWithGeminiNativePdf>>;
      try {
        nativeResponse = sourceIncluded
          ? await generateWithGeminiNativePdf({
              apiKey: profile.apiKey,
              baseUrl: profile.base_url,
              executionObserver,
              fileName,
              model: profile.model,
              outputContract: GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT,
              pdfBytes,
              prompt: repairPrompt,
              debugContext: {
                ...debugContext,
                attempt,
                fileName,
                inputStrategy,
                repairAttempt: attempt > 1,
                sourceIncluded,
              },
            })
          : await generateWithGeminiNativeText({
              apiKey: profile.apiKey,
              baseUrl: profile.base_url,
              executionObserver,
              model: profile.model,
              operation: "ai_pdf_extraction",
              outputContract: GEMINI_AI_PDF_EXTRACTION_OUTPUT_CONTRACT,
              prompt: repairPrompt,
              debugContext: {
                ...debugContext,
                attempt,
                inputStrategy,
                repairAttempt: true,
                sourceIncluded,
              },
            });
      } catch (error) {
        recorder?.complete({
          failureCategory: attemptFailureCategory(error),
          outcome: "failed",
        });
        preservePriorValidationError({ error, lastError });
      }
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
        recorder?.complete({
          outcome: "success",
          output,
          usage: nativeResponse.usage,
        });

        if (usedRepair) {
          extraction.warnings = [
            ...extraction.warnings,
            "AI provider response was repaired after schema validation failed.",
          ];
        }

        return extraction;
      } catch (error) {
        recorder?.complete({
          failureCategory: attemptFailureCategory(error),
          outcome: "failed",
          usage: nativeResponse.usage,
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
    const sourceIncluded =
      attempt === 1 ||
      (lastError instanceof AIPdfExtractionValidationError &&
        lastError.kind === "zero_importable");
    const repairPrompt =
      attempt === 1
        ? prompt
        : buildRepairPrompt({
            error: lastError,
            originalPrompt: sourceIncluded ? prompt : undefined,
            previousResponse,
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
              content: repairPrompt,
              role: "user" as const,
            },
          ];
    const recorder = qualityObserver?.beginAttempt({
      extractionAttempt: attempt,
      inputStrategy,
      promptBytes: Buffer.byteLength(repairPrompt, "utf8"),
      reason: attemptReason({
        extractionAttempt: attempt,
        lastError,
        routeCandidateIndex,
        transportAttempt,
      }),
      repairContextBytes:
        attempt > 1
          ? Buffer.byteLength(repairContext(previousResponse), "utf8")
          : 0,
      routeCandidateIndex,
      schemaBytes: 0,
      sourceBytes: sourceIncluded ? pdfBytes.byteLength : 0,
      sourceIncluded,
      taxonomyCatalogBytes: attempt === 1 ? taxonomyCatalogBytes : 0,
      transportAttempt,
    });
    let response: Awaited<ReturnType<typeof requestChatCompletion>>;
    try {
      response = await requestChatCompletion({
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
        profile,
      });
    } catch (error) {
      recorder?.complete({
        failureCategory: attemptFailureCategory(error),
        outcome: "failed",
      });
      preservePriorValidationError({ error, lastError });
    }
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
      recorder?.complete({
        outcome: "success",
        output,
        usage: response.usage,
      });

      if (usedRepair) {
        extraction.warnings = [
          ...extraction.warnings,
          "AI provider response was repaired after schema validation failed.",
        ];
      }

      return extraction;
    } catch (error) {
      recorder?.complete({
        failureCategory: attemptFailureCategory(error),
        outcome: "failed",
        usage: response.usage,
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
