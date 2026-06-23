import "server-only";

import { parsePossiblyMalformedJson } from "@/lib/ai-providers/json-repair";
import {
  listEnabledAIProviderProfiles,
  loadAIProviderProfileForUse,
} from "@/lib/ai-providers/profiles";
import { writePracticeFullCallLog } from "@/lib/practice/context";

const PRACTICE_AGENT_TIMEOUT_MS = 45_000;

type SupabaseLike = {
  from: (...args: any[]) => any;
  rpc: (...args: any[]) => any;
};

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
};

type LoadedProfile = Awaited<ReturnType<typeof loadAIProviderProfileForUse>>;

function endpoint(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function providerLabel(profile: Pick<LoadedProfile, "name" | "model">) {
  return `${profile.name} / ${profile.model}`;
}

function pickPracticeProfile(profiles: Awaited<ReturnType<typeof listEnabledAIProviderProfiles>>) {
  const profileText = (profile: (typeof profiles)[number]) =>
    `${profile.provider} ${profile.name} ${profile.model}`;

  return (
    profiles.find((profile) => /deepseek|\bds\b/i.test(profileText(profile)) && /reasoner|thinking|r1/i.test(profileText(profile))) ??
    profiles.find((profile) => profile.is_default && /deepseek|\bds\b/i.test(profileText(profile))) ??
    profiles.find((profile) => /deepseek|\bds\b/i.test(profileText(profile))) ??
    profiles.find((profile) => profile.is_default) ??
    profiles[0] ??
    null
  );
}

export async function loadPracticeAIProfile(supabase: SupabaseLike) {
  const safeProfiles = await listEnabledAIProviderProfiles(supabase);
  const selected = pickPracticeProfile(safeProfiles);

  if (!selected) {
    throw new Error("No enabled AI provider profile is available for Practice Agent.");
  }

  return loadAIProviderProfileForUse({ profileId: selected.id, supabase });
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
      body,
      endpoint: endpoint(profile.base_url),
      headers: {
        Authorization: "Bearer [redacted]",
        "Content-Type": "application/json",
      },
      method: "POST",
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
    await writePracticeFullCallLog({
      context: debugContext,
      event: "error",
      payload: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : "UnknownError",
        requestLogSaved,
      },
    });
    throw error;
  }

  const text = await response.text();

  if (!response.ok) {
    await writePracticeFullCallLog({
      context: debugContext,
      event: "error",
      payload: {
        body: text,
        status: response.status,
        statusText: response.statusText,
      },
    });
    throw new Error(`Practice AI provider failed (${response.status}): ${text.slice(0, 800)}`);
  }

  await writePracticeFullCallLog({
    context: debugContext,
    event: "response",
    payload: {
      body: text,
      requestLogSaved,
      status: response.status,
      statusText: response.statusText,
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
  const hasReasoningContent = Object.prototype.hasOwnProperty.call(message, "reasoning_content");
  const reasoningContent = hasReasoningContent
    ? typeof message.reasoning_content === "string"
      ? message.reasoning_content
      : null
    : undefined;
  const contentText = typeof message.content === "string" ? message.content : "";
  const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
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
}): Promise<{ parsed: T; providerLabel: string; rawText: string }> {
  const result = await callPracticeChatModel({ debugContext, messages, profile, responseFormatJson: true });
  const contentText = result.contentText || JSON.stringify(result.rawPayload);

  return {
    parsed: parsePossiblyMalformedJson(contentText) as T,
    providerLabel: result.providerLabel,
    rawText: contentText,
  };
}
