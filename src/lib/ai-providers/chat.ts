import "server-only";

import {
  normalizeAIPdfExtractionResponse,
  type AIPdfExtraction,
} from "@/lib/ai-pdf-import/schema";
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
import {
  generateWithGeminiNativePdf,
  testGeminiNativeTextConnection,
} from "@/lib/ai-providers/gemini-native";

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
  fileName: string;
  inputStrategy: AiPdfInputStrategy;
  pageImageDataUrls: string[];
  pdfBase64: string;
  pdfBytes: Buffer;
  prompt: string;
  profile: ProviderProfileForUse;
};

type ChatMessage = {
  content: unknown;
  role: "assistant" | "user";
};

const MAX_EXTRACTION_ATTEMPTS = 2;
const MAX_REPAIR_RESPONSE_CHARS = 60_000;
const CHAT_COMPLETION_TIMEOUT_MS = 180_000;
const CONNECTION_TEST_TIMEOUT_MS = 15_000;

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
    return [
      `AI provider ${operation} timed out at the provider gateway (524) for ${providerLabel}.`,
      "The request reached the configured base URL, but the upstream model/proxy did not finish before the gateway timeout.",
      "Retry later, switch provider/base URL, or import a smaller PDF if this keeps happening.",
      preview ? `Provider response: ${preview}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (status >= 500) {
    return [
      `AI provider ${operation} failed with upstream server error (${status}) for ${providerLabel}.`,
      preview ? `Provider response: ${preview}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `AI provider ${operation} failed (${status}) for ${providerLabel}.`,
    preview ? `Provider response: ${preview}` : "",
  ]
    .filter(Boolean)
    .join(" ");
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
  const message = error instanceof Error ? error.message : "Unknown network error.";

  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return `AI provider ${operation} timed out locally after ${Math.round(
      timeoutMs / 1000,
    )}s for ${providerLabel}. Retry later, switch provider/base URL, or reduce the PDF size.`;
  }

  return `AI provider ${operation} could not reach ${profile.base_url} for ${providerLabel}: ${message}`;
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
  } catch (error) {
    throw new Error(
      `AI provider returned non-JSON content: ${
        error instanceof Error ? error.message : "Unknown parse error"
      }. Response preview: ${responsePreview(contentText)}`,
    );
  }

  try {
    return normalizeAIPdfExtractionResponse(parsed);
  } catch (error) {
    throw new Error(
      `AI provider JSON did not match the expected import schema: ${
        error instanceof Error ? error.message : "Unknown schema validation error."
      }. Response preview: ${responsePreview(contentText)}`,
    );
  }
}

async function requestChatCompletion({
  debugContext,
  messages,
  profile,
}: {
  debugContext?: Record<string, unknown>;
  messages: ChatMessage[];
  profile: ProviderProfileForUse;
}) {
  let response: Response;
  const requestBody = {
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
    response = await fetch(endpoint(profile.base_url), {
      body: JSON.stringify(requestBody),
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
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
    const text = await response.text();
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

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
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

  return contentText;
}

function buildRepairPrompt({
  error,
  previousResponse,
}: {
  error: unknown;
  previousResponse: string;
}) {
  return [
    "Your previous answer could not be imported because it did not match the required JSON schema.",
    "Keep the same extracted questions, tags, page references, solutions, and asset placeholder intent from your previous answer.",
    "Only repair the JSON structure and field values. Do not drop questions unless the previous answer was clearly empty.",
    "",
    "Required output shape:",
    '{"questions":[{"title":"...","question_code":"...","question_type":"mcq|frq|mixed","difficulty_rating":500,"content_html":"...","content_source":"...","solution_html":"...","solution_source":"...","tag_ids":[],"page_refs":[1],"asset_placeholders":[]}],"warnings":[]}',
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
        content_html: "<p>Mock AI PDF import content.</p>",
        content_source: "Mock AI PDF import content.",
        difficulty_rating: 500,
        page_refs: [1],
        question_code: "AI-PDF-MOCK-1",
        question_type: "frq",
        solution_html: "<p>Mock AI PDF import solution.</p>",
        solution_source: "Mock AI PDF import solution.",
        tag_ids: [],
        title: "Mock AI PDF import question",
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
    const text = await response.text();
    throw new Error(
      providerHttpErrorMessage({
        body: text,
        operation: "test",
        profile,
        status: response.status,
      }),
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const contentText = payload.choices?.[0]?.message?.content?.trim();

  return {
    message: contentText
      ? `Connection test succeeded. Provider replied: ${contentText.slice(0, 80)}`
      : "Connection test succeeded.",
    ok: true as const,
  };
}

export async function callAIPdfExtractionProvider({
  debugContext,
  fileName,
  inputStrategy,
  pageImageDataUrls,
  pdfBase64,
  pdfBytes,
  profile,
  prompt,
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

    for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt += 1) {
      const contentText = (
        await generateWithGeminiNativePdf({
          apiKey: profile.apiKey,
          baseUrl: profile.base_url,
          fileName,
          model: profile.model,
          pdfBytes,
          prompt:
            attempt === 1
              ? prompt
              : buildRepairPrompt({
                  error: lastError,
                  previousResponse,
                }),
          debugContext: {
            ...debugContext,
            attempt,
            fileName,
            inputStrategy,
            repairAttempt: attempt > 1,
          },
        })
      ).text;
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
        const extraction = parseExtractionContent(contentText);

        if (usedRepair) {
          extraction.warnings = [
            ...extraction.warnings,
            "AI provider response was repaired after schema validation failed.",
          ];
        }

        return extraction;
      } catch (error) {
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

  const messages: ChatMessage[] = [
    {
      content,
      role: "user",
    },
  ];
  let lastError: unknown = null;
  let usedRepair = false;

  for (let attempt = 1; attempt <= MAX_EXTRACTION_ATTEMPTS; attempt += 1) {
    const contentText = await requestChatCompletion({
      debugContext: {
        ...debugContext,
        attempt,
        fileName,
        inputStrategy,
        repairAttempt: attempt > 1,
      },
      messages,
      profile,
    });
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
      const extraction = parseExtractionContent(contentText);

      if (usedRepair) {
        extraction.warnings = [
          ...extraction.warnings,
          "AI provider response was repaired after schema validation failed.",
        ];
      }

      return extraction;
    } catch (error) {
      lastError = error;

      if (attempt >= MAX_EXTRACTION_ATTEMPTS) {
        break;
      }

      usedRepair = true;
      messages.push({
        content: contentText,
        role: "assistant",
      });
      messages.push({
        content: buildRepairPrompt({
          error,
          previousResponse: contentText,
        }),
        role: "user",
      });
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("AI provider JSON did not match the expected import schema.");
}
