import "server-only";

import {
  getAiProviderCapabilities,
  inferAiProviderMode,
} from "@/lib/ai-providers/adapters";
import {
  AIProviderError,
  classifyAIProviderError,
  isAIProviderError,
} from "@/lib/ai-providers/errors";
import { parsePossiblyMalformedJson } from "@/lib/ai-providers/json-repair";
import {
  listEnabledAIProviderProfilesForServerUse,
  loadAIProviderProfileForServerUse,
  type SafeAIProviderProfile,
} from "@/lib/ai-providers/profiles";
import { writePracticeFullCallLog } from "@/lib/practice/context";

const PRACTICE_AGENT_TIMEOUT_MS = 45_000;

export type PracticeChatMessage = {
  content?: string | null;
  name?: string;
  reasoning_content?: string | null;
  role: "system" | "user" | "assistant" | "tool";
  tool_call_id?: string;
  tool_calls?: PracticeToolCall[];
};

export type PracticeToolDefinition = {
  function: {
    description?: string;
    name: string;
    parameters: Record<string, unknown>;
  };
  type: "function";
};

export type PracticeToolCall = {
  function: {
    arguments: string;
    name: string;
  };
  id: string;
  type?: "function";
};

export type PracticeChatModelResult = {
  contentText: string;
  hasReasoningContent: boolean;
  fullCallLogSaved: boolean;
  providerLabel: string;
  rawPayload: unknown;
  reasoningContent?: string | null;
  toolCalls: PracticeToolCall[];
  usage?: Record<string, unknown> | null;
};

type LoadedProfile = Awaited<ReturnType<typeof loadAIProviderProfileForServerUse>>;

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function providerLabel(profile: Pick<LoadedProfile, "name" | "model">) {
  return `${profile.name} / ${profile.model}`;
}

function providerSupportsPractice(profile: SafeAIProviderProfile) {
  const capabilities = getAiProviderCapabilities(profile);
  const mode = inferAiProviderMode(profile);

  return (
    capabilities.supportsText &&
    capabilities.supportsJsonMode &&
    ["openai_compatible", "deepseek_openai", "gemini_openai", "mock"].includes(mode)
  );
}

function pickPracticeProfile(profiles: SafeAIProviderProfile[]) {
  const compatible = profiles.filter(providerSupportsPractice);

  return compatible.find((profile) => profile.is_default) ?? compatible[0] ?? null;
}

function asPracticeProviderError(error: unknown) {
  if (isAIProviderError(error) && error.operation === "practice_generation") {
    return error;
  }

  const classified = classifyAIProviderError({
    error,
    operation: "practice_generation",
  });

  return new AIProviderError({
    code: classified.code,
    operation: "practice_generation",
    retryable: classified.retryable,
    statusCode: classified.statusCode,
  });
}

export async function loadPracticeAIProfile() {
  // Practice callers authenticate before reaching this resolver. Provider
  // selection stays in server-only service-role code, never in a caller's
  // session or the super-admin management gateway.
  const safeProfiles = await listEnabledAIProviderProfilesForServerUse();
  const selected = pickPracticeProfile(safeProfiles);

  if (!selected) {
    throw new AIProviderError({
      code: "provider_configuration_error",
      operation: "practice_generation",
      retryable: false,
    });
  }

  return loadAIProviderProfileForServerUse({ profileId: selected.id });
}

export function parsePracticeToolArguments(value: string) {
  if (!value.trim()) {
    return {} as Record<string, unknown>;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    try {
      const parsed = parsePossiblyMalformedJson(value);
      return parsed && typeof parsed === "object"
        ? parsed as Record<string, unknown>
        : { _raw_arguments: String(parsed ?? "") };
    } catch (error) {
      return {
        _parse_error: error instanceof Error ? error.message : String(error),
        _raw_arguments: value.slice(0, 2000),
      };
    }
  }
}

function isDeepSeekProfile(profile: LoadedProfile) {
  return /deepseek/i.test([profile.provider, profile.name, profile.model, profile.base_url].join(" "));
}

export async function callPracticeChatModel({
  debugContext,
  messages,
  profile,
  responseFormatJson,
  toolChoice,
  tools,
}: {
  debugContext?: Record<string, unknown>;
  messages: PracticeChatMessage[];
  profile: LoadedProfile;
  responseFormatJson?: boolean;
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  tools?: PracticeToolDefinition[];
}): Promise<PracticeChatModelResult> {
  const body = {
    messages,
    model: profile.model,
    ...(responseFormatJson && isDeepSeekProfile(profile) ? { response_format: { type: "json_object" } } : {}),
    ...(tools?.length ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
  };
  const requestLogSaved = await writePracticeFullCallLog({
    context: {
      ...debugContext,
      model: profile.model,
      provider: profile.provider,
      providerName: profile.name,
    },
    event: "request",
    payload: {
      method: "POST",
      messageCount: messages.length,
      responseFormatJson: Boolean(responseFormatJson),
      toolCount: tools?.length ?? 0,
    },
  });

  let response: Response;

  try {
    response = await fetch(endpoint(profile.base_url), {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(PRACTICE_AGENT_TIMEOUT_MS),
    });
  } catch (error) {
    const failure = asPracticeProviderError(error);
    await writePracticeFullCallLog({
      context: debugContext,
      event: "error",
      payload: {
        errorCode: failure.code,
        requestLogSaved,
        statusCode: failure.statusCode ?? null,
      },
    });
    throw failure;
  }

  if (!response.ok) {
    const failure = asPracticeProviderError({ status: response.status });
    await response.body?.cancel().catch(() => undefined);
    await writePracticeFullCallLog({
      context: debugContext,
      event: "error",
      payload: {
        errorCode: failure.code,
        statusCode: response.status,
      },
    });
    throw failure;
  }

  const text = await response.text();

  await writePracticeFullCallLog({
    context: debugContext,
    event: "response",
    payload: {
      requestLogSaved,
      responseBytes: new TextEncoder().encode(text).byteLength,
      statusCode: response.status,
    },
  });

  let payload: any = text;
  try {
    payload = JSON.parse(text);
  } catch {
    return {
      contentText: text,
      fullCallLogSaved: requestLogSaved,
      hasReasoningContent: false,
      providerLabel: providerLabel(profile),
      rawPayload: text,
      toolCalls: [],
    };
  }

  const message = payload?.choices?.[0]?.message ?? {};
  const usage = payload?.usage && typeof payload.usage === "object" && !Array.isArray(payload.usage)
    ? payload.usage as Record<string, unknown>
    : null;
  const hasReasoningContent = Object.prototype.hasOwnProperty.call(message, "reasoning_content");
  const reasoningContent = hasReasoningContent
    ? typeof message.reasoning_content === "string"
      ? message.reasoning_content
      : null
    : undefined;
  const contentText = typeof message.content === "string" ? message.content : "";
  const legacyFunctionCall = message.function_call?.name
    ? [{
      function: message.function_call,
      id: `practice-tool-${Date.now()}-legacy`,
      type: "function",
    }]
    : [];
  const rawToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length
    ? message.tool_calls
    : legacyFunctionCall;
  const toolCalls: PracticeToolCall[] = rawToolCalls
    .filter((item: any) => item?.function?.name)
    .map((item: any, index: number) => ({
      function: {
        arguments: typeof item.function.arguments === "string" ? item.function.arguments : JSON.stringify(item.function.arguments ?? {}),
        name: String(item.function.name),
      },
      id: String(item.id ?? `practice-tool-${Date.now()}-${index}`),
      type: "function" as const,
    }));

  return {
    contentText,
    fullCallLogSaved: requestLogSaved,
    hasReasoningContent,
    providerLabel: providerLabel(profile),
    rawPayload: payload,
    reasoningContent,
    toolCalls,
    usage,
  };
}

function parseStreamEvents(buffer: string) {
  const parts = buffer.split(/\n\n/);
  const rest = parts.pop() ?? "";
  const events = parts.flatMap((part) =>
    part
      .split(/\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim()),
  );

  return { events, rest };
}

export async function callPracticeChatModelStream({
  debugContext,
  messages,
  onDelta,
  profile,
  toolChoice,
}: {
  debugContext?: Record<string, unknown>;
  messages: PracticeChatMessage[];
  onDelta: (text: string) => void | Promise<void>;
  profile: LoadedProfile;
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
}): Promise<PracticeChatModelResult> {
  const body = {
    messages,
    model: profile.model,
    stream: true,
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
  };
  const requestLogSaved = await writePracticeFullCallLog({
    context: {
      ...debugContext,
      model: profile.model,
      provider: profile.provider,
      providerName: profile.name,
    },
    event: "request",
    payload: {
      method: "POST",
      messageCount: messages.length,
      stream: true,
    },
  });

  let response: Response;
  try {
    response = await fetch(endpoint(profile.base_url), {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${profile.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(PRACTICE_AGENT_TIMEOUT_MS),
    });
  } catch (error) {
    const failure = asPracticeProviderError(error);
    await writePracticeFullCallLog({
      context: debugContext,
      event: "error",
      payload: {
        errorCode: failure.code,
        requestLogSaved,
        statusCode: failure.statusCode ?? null,
      },
    });
    throw failure;
  }

  if (!response.ok) {
    const failure = asPracticeProviderError({ status: response.status });
    await response.body?.cancel().catch(() => undefined);
    await writePracticeFullCallLog({
      context: debugContext,
      event: "error",
      payload: {
        errorCode: failure.code,
        statusCode: response.status,
      },
    });
    throw failure;
  }

  if (!response.body) {
    throw new Error("Practice AI provider stream body is not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let contentText = "";
  const rawEvents: unknown[] = [];
  let usage: Record<string, unknown> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const parsed = parseStreamEvents(buffer);
    buffer = parsed.rest;

    for (const event of parsed.events) {
      if (event === "[DONE]") {
        continue;
      }

      let payload: any;
      try {
        payload = JSON.parse(event);
      } catch {
        continue;
      }
      rawEvents.push(payload);
      if (payload?.usage && typeof payload.usage === "object" && !Array.isArray(payload.usage)) {
        usage = payload.usage as Record<string, unknown>;
      }
      const delta = payload?.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta) {
        contentText += delta;
        await onDelta(delta);
      }
    }

    if (done) break;
  }

  await writePracticeFullCallLog({
    context: debugContext,
    event: "response",
    payload: {
      eventCount: rawEvents.length,
      outputChars: contentText.length,
      requestLogSaved,
      statusCode: response.status,
    },
  });

  return {
    contentText,
    fullCallLogSaved: requestLogSaved,
    hasReasoningContent: false,
    providerLabel: providerLabel(profile),
    rawPayload: rawEvents,
    toolCalls: [],
    usage,
  };
}

export function buildAssistantMessageForToolContinuation(result: PracticeChatModelResult): PracticeChatMessage {
  const message: PracticeChatMessage = {
    content: result.contentText || null,
    role: "assistant",
    tool_calls: result.toolCalls,
  };

  // DeepSeek thinking-mode tool calls require exact reasoning_content round-trip on the
  // next request. Do not expose this in UI trace, but preserve it in message history.
  if (result.toolCalls.length && result.hasReasoningContent) {
    message.reasoning_content = result.reasoningContent ?? "";
  }

  return message;
}

export async function callPracticeJsonModel<T>({
  debugContext,
  messages,
  profile,
}: {
  debugContext?: Record<string, unknown>;
  messages: PracticeChatMessage[];
  profile: LoadedProfile;
}): Promise<{ parsed: T; providerLabel: string; usage?: Record<string, unknown> | null }> {
  const result = await callPracticeChatModel({ debugContext, messages, profile, responseFormatJson: true });
  const contentText = result.contentText || JSON.stringify(result.rawPayload);

  let parsed: T;
  try {
    parsed = parsePossiblyMalformedJson(contentText) as T;
  } catch {
    throw new AIProviderError({
      code: "provider_invalid_response",
      operation: "practice_generation",
      retryable: false,
    });
  }

  return {
    parsed,
    providerLabel: result.providerLabel,
    usage: result.usage,
  };
}
