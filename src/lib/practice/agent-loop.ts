import "server-only";

import {
  buildAssistantMessageForToolContinuation,
  callPracticeChatModel,
  parsePracticeToolArguments,
  type PracticeChatMessage,
  type PracticeToolCall,
  type PracticeToolDefinition,
} from "@/lib/practice/ai";
import { buildToolDigest, compactSessionMemory, writePracticeFullCallLog } from "@/lib/practice/context";
import type {
  PracticeQuestionCandidate,
  PracticeRecommendation,
  PracticeTagContext,
  PracticeTraceEvent,
} from "@/lib/practice/types";
import {
  browseTaxonomyBatch,
  formatBrowseTaxonomyBatchForModel,
  formatPracticeSearchBatchForModel,
  practiceSearchBatch,
  type BrowseTaxonomyBatchRequest,
  type PracticeSearchBatchLane,
  type PracticeSearchMode,
} from "@/lib/practice/tools";

const DEFAULT_MAX_TOOL_CALLS = 6;
const HARD_MAX_TOOL_CALLS = 7;
const MIN_MAX_TOOL_CALLS = 3;
const SOFT_BROWSE_CALL_LIMIT = 2;
const HARD_BROWSE_CALL_LIMIT = 3;
const SEARCH_CALL_LIMIT = 2;

type SupabaseLike = {
  from: (...args: any[]) => any;
  rpc: (...args: any[]) => any;
};

type PracticeProfile = Parameters<typeof callPracticeChatModel>[0]["profile"];

type FinalizeArgs = {
  expected_skills?: Record<string, string>;
  question_ids?: string[];
  reasons?: Record<string, string>;
  round_goal?: string;
  session_memory?: string;
  tag_context?: PracticeTagContext;
  visible_thought?: string;
};

type ToolExecutionState = {
  browseCallsUsed: number;
  candidatePool: Map<string, PracticeQuestionCandidate>;
  completedQuestionIds: string[];
  confirmedTargetTagIds: Set<string>;
  finalized?: FinalizeArgs;
  goal: string;
  onTrace?: (event: PracticeTraceEvent) => void | Promise<void>;
  questionCount: number;
  searchCallsUsed: number;
  sessionMemory: string;
  supabase: SupabaseLike;
  tagContext: PracticeTagContext;
  trace: PracticeTraceEvent[];
};

function envToolCallLimit() {
  const parsed = Number(process.env.PRACTICE_AGENT_MAX_TOOL_CALLS ?? DEFAULT_MAX_TOOL_CALLS);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_TOOL_CALLS;
  }

  return Math.min(HARD_MAX_TOOL_CALLS, Math.max(MIN_MAX_TOOL_CALLS, Math.trunc(parsed)));
}

function emptyTagContext(goal?: string): PracticeTagContext {
  return {
    confirmedTagIds: [],
    lastGoal: goal,
    usefulTags: [],
    version: 1,
  };
}

function normalizeTagContext(value: unknown, goal: string): PracticeTagContext {
  if (!value || typeof value !== "object") {
    return emptyTagContext(goal);
  }

  const record = value as Partial<PracticeTagContext>;
  return compactTagContext({
    confirmedTagIds: Array.isArray(record.confirmedTagIds)
      ? record.confirmedTagIds.map(String).filter(Boolean)
      : [],
    lastGoal: typeof record.lastGoal === "string" ? record.lastGoal : goal,
    usefulTags: Array.isArray(record.usefulTags)
      ? record.usefulTags.map((tag) => {
          const item = tag && typeof tag === "object" ? tag as Record<string, unknown> : {};
          const source: PracticeTagContext["usefulTags"][number]["source"] =
            item.source === "memory" || item.source === "browse" || item.source === "search"
            ? item.source
            : "memory";
          const searchableQuestionCount = Number(item.searchableQuestionCount);

          return {
            searchableQuestionCount: Number.isFinite(searchableQuestionCount)
              ? Math.max(0, Math.trunc(searchableQuestionCount))
              : undefined,
            source,
            tagId: String(item.tagId ?? "").trim(),
          };
        }).filter((tag) => tag.tagId)
      : [],
    version: 1,
  });
}

function compactTagContext(context: PracticeTagContext): PracticeTagContext {
  const confirmedTagIds = Array.from(new Set(context.confirmedTagIds.map(String).filter(Boolean))).slice(0, 24);
  const seenUsefulTags = new Set<string>();
  const usefulTags = context.usefulTags
    .filter((tag) => tag.tagId && !seenUsefulTags.has(tag.tagId))
    .map((tag) => {
      seenUsefulTags.add(tag.tagId);
      return {
        searchableQuestionCount: tag.searchableQuestionCount,
        source: tag.source,
        tagId: tag.tagId,
      };
    })
    .slice(0, 24);

  return {
    confirmedTagIds,
    lastGoal: context.lastGoal?.slice(0, 240),
    usefulTags,
    version: 1,
  };
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown, limit = 16) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, limit)
    : [];
}

function asNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function compactObservation(value: unknown, maxChars = 5200) {
  return JSON.stringify(value).replace(/\s+/g, " ").slice(0, maxChars);
}

async function pushTrace(state: Pick<ToolExecutionState, "onTrace" | "trace">, event: PracticeTraceEvent) {
  state.trace.push(event);
  await state.onTrace?.(event);
}

function schema(properties: Record<string, unknown>, required: string[] = ["visible_thought"]) {
  return {
    additionalProperties: false,
    properties: {
      visible_thought: {
        description:
          "A short UI-safe process summary explaining why this tool is useful now. Do not include hidden chain-of-thought.",
        type: "string",
      },
      ...properties,
    },
    required,
    type: "object",
  };
}

const browseTool: PracticeToolDefinition = {
  type: "function",
  function: {
    name: "browse_taxonomy_batch",
    description:
      "Batch browse known taxonomy tags. Facets are already known: curriculum, concept, method, task, form. Use only when tag_context is insufficient or you need target tag ids/searchable counts.",
    parameters: schema(
      {
        requests: {
          description: "At most 8 requests. Each returns at most 15 tag ids.",
          items: {
            additionalProperties: false,
            properties: {
              guess_path: { type: "string" },
              parent_tag_id: { type: "string" },
              query: { type: "string" },
              request_id: { type: "string" },
              source: {
                enum: ["goal", "tag_context", "strict_gap", "relaxed_planning"],
                type: "string",
              },
            },
            required: ["request_id", "source"],
            type: "object",
          },
          type: "array",
        },
      },
      ["visible_thought", "requests"],
    ),
  },
};

const searchTool: PracticeToolDefinition = {
  type: "function",
  function: {
    name: "practice_search_batch",
    description:
      "Batch search published approved question candidates. First call must be strict and use only confirmed target tag subtrees. Second call may be relaxed with parent/adjacent tag subtrees or small keyword text.",
    parameters: schema(
      {
        lanes: {
          description: "At most 4 search lanes.",
          items: {
            additionalProperties: false,
            properties: {
              confirmed_tag_ids: { items: { type: "string" }, type: "array" },
              lane_id: { type: "string" },
              limit: { default: 8, minimum: 4, maximum: 20, type: "integer" },
              query_text: { type: "string" },
              rationale: { type: "string" },
            },
            required: ["lane_id", "confirmed_tag_ids", "rationale"],
            type: "object",
          },
          type: "array",
        },
        mode: { enum: ["strict", "relaxed"], type: "string" },
      },
      ["visible_thought", "mode", "lanes"],
    ),
  },
};

const finalizeTool: PracticeToolDefinition = {
  type: "function",
  function: {
    name: "finalize_recommendation",
    description:
      "Finish the recommendation loop. Select exact question ids from candidates already returned by practice_search_batch and provide concise reasons.",
    parameters: schema(
      {
        expected_skills: {
          additionalProperties: { type: "string" },
          description: "Map question id to expected skill.",
          type: "object",
        },
        question_ids: {
          description: "Exact question ids selected from candidates already returned by practice_search_batch.",
          items: { type: "string" },
          type: "array",
        },
        reasons: {
          additionalProperties: { type: "string" },
          description: "Map question id to a short recommendation reason. Mention relaxed matching when relevant.",
          type: "object",
        },
        round_goal: { type: "string" },
        session_memory: {
          description: "Updated compact session memory, max 1600 chars. Do not copy full question stems.",
          type: "string",
        },
        tag_context: {
          additionalProperties: false,
          description: "Compact reusable tag state for the next recommendation round.",
          properties: {
            confirmedTagIds: { items: { type: "string" }, type: "array" },
            lastGoal: { type: "string" },
            usefulTags: {
              items: {
                additionalProperties: false,
                properties: {
                  searchableQuestionCount: { type: "integer" },
                  source: { enum: ["memory", "browse", "search"], type: "string" },
                  tagId: { type: "string" },
                },
                required: ["tagId", "source"],
                type: "object",
              },
              type: "array",
            },
            version: { const: 1, type: "integer" },
          },
          required: ["version", "confirmedTagIds", "usefulTags"],
          type: "object",
        },
      },
      [
        "visible_thought",
        "question_ids",
        "reasons",
        "expected_skills",
        "round_goal",
        "session_memory",
        "tag_context",
      ],
    ),
  },
};

function availableTools(state: ToolExecutionState): PracticeToolDefinition[] {
  if (state.searchCallsUsed >= SEARCH_CALL_LIMIT) {
    return [finalizeTool];
  }

  const tools = [searchTool, finalizeTool];

  if (state.browseCallsUsed < SOFT_BROWSE_CALL_LIMIT) {
    return [browseTool, ...tools];
  }

  if (state.browseCallsUsed < HARD_BROWSE_CALL_LIMIT && !state.confirmedTargetTagIds.size) {
    return [browseTool, ...tools];
  }

  return tools;
}

function fallbackRecommendations({
  candidates,
  count,
}: {
  candidates: PracticeQuestionCandidate[];
  count: number;
}): PracticeRecommendation[] {
  return candidates.slice(0, count).map((candidate, index) => ({
    ...candidate,
    expectedSkill: candidate.tagIds.slice(0, 2).join(", ") || candidate.questionType,
    reason: `Fallback selection ${index + 1}: this candidate is available in the current search pool. Its match may be broader than the original goal if strict search was sparse.`,
  }));
}

function mapFinalRecommendations({
  candidates,
  count,
  finalized,
}: {
  candidates: PracticeQuestionCandidate[];
  count: number;
  finalized?: FinalizeArgs;
}) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const selected: PracticeRecommendation[] = [];

  for (const id of finalized?.question_ids ?? []) {
    const candidate = byId.get(String(id));
    if (!candidate || selected.some((item) => item.id === candidate.id)) {
      continue;
    }

    selected.push({
      ...candidate,
      expectedSkill:
        asString(finalized?.expected_skills?.[candidate.id]) || candidate.tagIds[0] || candidate.questionType,
      reason: asString(finalized?.reasons?.[candidate.id]) || "Selected by the practice agent.",
    });

    if (selected.length >= count) {
      break;
    }
  }

  if (selected.length < count) {
    for (const fallback of fallbackRecommendations({ candidates, count })) {
      if (!selected.some((item) => item.id === fallback.id)) {
        selected.push(fallback);
      }
      if (selected.length >= count) {
        break;
      }
    }
  }

  return selected.slice(0, count);
}

function makeToolResultMessage(toolCall: PracticeToolCall, observation: unknown): PracticeChatMessage {
  return {
    content: typeof observation === "string" ? observation : compactObservation(observation),
    role: "tool",
    tool_call_id: toolCall.id,
  };
}

async function rejectPracticeToolCall({
  iteration,
  reason,
  state,
  toolCall,
}: {
  iteration: number;
  reason: string;
  state: ToolExecutionState;
  toolCall: PracticeToolCall;
}) {
  const toolName = toolCall.function.name;
  const observation = `TOOL_REJECTED tool=${toolName} reason=${reason}`;

  await pushTrace(state, {
    error: reason,
    inputSummary: toolName,
    iteration,
    outputSummary: observation,
    phase: "recommendation",
    toolCallId: toolCall.id,
    toolName,
  });

  return makeToolResultMessage(toolCall, observation);
}

function asBrowseRequests(value: unknown): BrowseTaxonomyBatchRequest[] {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const source = record.source === "tag_context" ||
      record.source === "strict_gap" ||
      record.source === "relaxed_planning"
      ? record.source
      : "goal";

    return {
      guess_path: asString(record.guess_path) || undefined,
      parent_tag_id: asString(record.parent_tag_id) || undefined,
      query: asString(record.query) || undefined,
      request_id: asString(record.request_id, `browse-${index + 1}`),
      source,
    };
  });
}

function asSearchLanes(value: unknown, state: ToolExecutionState): PracticeSearchBatchLane[] {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      confirmed_tag_ids: asStringArray(record.confirmed_tag_ids, 12),
      lane_id: asString(record.lane_id, `lane-${index + 1}`),
      limit: asNumber(record.limit, Math.max(state.questionCount * 2, 8), 4, 20),
      query_text: asString(record.query_text) || undefined,
      rationale: asString(record.rationale, "Candidate search lane."),
    };
  });
}

function mergeBrowseIntoTagContext(state: ToolExecutionState, result: Awaited<ReturnType<typeof browseTaxonomyBatch>>) {
  const usefulTags = [...state.tagContext.usefulTags];

  for (const item of result.results) {
    for (const tag of item.tags) {
      if (tag.is_assignable && tag.searchable_question_count > 0) {
        state.confirmedTargetTagIds.add(tag.tag_id);
      }
      usefulTags.push({
        searchableQuestionCount: tag.searchable_question_count,
        source: "browse",
        tagId: tag.tag_id,
      });
    }
  }

  state.tagContext = compactTagContext({
    confirmedTagIds: [
      ...state.tagContext.confirmedTagIds,
      ...Array.from(state.confirmedTargetTagIds),
    ],
    lastGoal: state.goal,
    usefulTags,
    version: 1,
  });
}

function mergeSearchIntoTagContext(state: ToolExecutionState, result: Awaited<ReturnType<typeof practiceSearchBatch>>) {
  const searchedTags = result.laneSummaries.flatMap((lane) => lane.effective_tags);
  const matchedTags = result.shortCandidates.flatMap((candidate) => candidate.tag_ids);

  for (const tagId of searchedTags) {
    state.confirmedTargetTagIds.add(tagId);
  }

  state.tagContext = compactTagContext({
    confirmedTagIds: [
      ...state.tagContext.confirmedTagIds,
      ...Array.from(state.confirmedTargetTagIds),
      ...searchedTags,
    ],
    lastGoal: state.goal,
    usefulTags: [
      ...state.tagContext.usefulTags,
      ...searchedTags.map((tagId) => ({ source: "search" as const, tagId })),
      ...matchedTags.map((tagId) => ({ source: "search" as const, tagId })),
    ],
    version: 1,
  });
}

async function executePracticeTool({
  args,
  iteration,
  state,
  toolCall,
}: {
  args: Record<string, unknown>;
  iteration: number;
  state: ToolExecutionState;
  toolCall: PracticeToolCall;
}) {
  const toolName = toolCall.function.name;
  const visibleThought = asString(args.visible_thought).slice(0, 500);
  const started = Date.now();

  try {
    let logObservation: unknown;
    let modelObservation: unknown;
    let resultCount: number | undefined;
    let outputSummary = "";

    if (toolName === "browse_taxonomy_batch") {
      state.browseCallsUsed += 1;
      const requests = asBrowseRequests(args.requests);
      const result = await browseTaxonomyBatch({ requests, supabase: state.supabase });
      mergeBrowseIntoTagContext(state, result);
      logObservation = result;
      modelObservation = formatBrowseTaxonomyBatchForModel(result);
      resultCount = result.results.reduce((sum, item) => sum + item.tags.length, 0);
      outputSummary = [
        `browse_call=${state.browseCallsUsed}/${SOFT_BROWSE_CALL_LIMIT}`,
        `requests=${result.results.length}`,
        `confirmed=${state.tagContext.confirmedTagIds.slice(0, 8).join(",") || "none"}`,
      ].join("; ");
    } else if (toolName === "practice_search_batch") {
      state.searchCallsUsed += 1;
      const requestedMode = args.mode === "relaxed" ? "relaxed" : "strict";
      const mode: PracticeSearchMode = state.searchCallsUsed === 1 ? "strict" : requestedMode;
      const lanes = asSearchLanes(args.lanes, state);
      const result = await practiceSearchBatch({
        completedQuestionIds: state.completedQuestionIds,
        lanes,
        mode,
        questionCount: state.questionCount,
        supabase: state.supabase,
      });

      for (const candidate of result.candidates) {
        state.candidatePool.set(candidate.id, candidate);
      }

      mergeSearchIntoTagContext(state, result);
      logObservation = {
        candidate_pool_size: state.candidatePool.size,
        candidates: result.shortCandidates,
        lane_summaries: result.laneSummaries,
        mode,
        search_call: state.searchCallsUsed,
      };
      modelObservation = formatPracticeSearchBatchForModel({
        mode,
        poolSize: state.candidatePool.size,
        questionCount: state.questionCount,
        result,
      });
      resultCount = result.shortCandidates.length;
      outputSummary = [
        `search_call=${state.searchCallsUsed}/${SEARCH_CALL_LIMIT}`,
        `mode=${mode}`,
        `lanes=${result.laneSummaries.map((lane) => `${lane.lane_id}:${lane.result_count}:${lane.match_quality}`).join(",")}`,
        `pool=${state.candidatePool.size}`,
      ].join("; ");
    } else if (toolName === "finalize_recommendation") {
      state.finalized = {
        expected_skills: typeof args.expected_skills === "object" && args.expected_skills ? args.expected_skills as Record<string, string> : {},
        question_ids: asStringArray(args.question_ids),
        reasons: typeof args.reasons === "object" && args.reasons ? args.reasons as Record<string, string> : {},
        round_goal: asString(args.round_goal, state.goal),
        session_memory: asString(args.session_memory, state.sessionMemory).slice(0, 1600),
        tag_context: normalizeTagContext(args.tag_context, state.goal),
        visible_thought: visibleThought,
      };
      state.tagContext = compactTagContext(state.finalized.tag_context ?? state.tagContext);
      logObservation = {
        accepted: true,
        candidate_pool_size: state.candidatePool.size,
        selected_question_ids: state.finalized.question_ids,
        tag_context_size: state.tagContext.confirmedTagIds.length,
      };
      modelObservation = `FINALIZE accepted=true selected=${state.finalized.question_ids?.join(",") || "none"} pool=${state.candidatePool.size} tag_context=${state.tagContext.confirmedTagIds.length}`;
      resultCount = state.finalized.question_ids?.length ?? 0;
      outputSummary = `selected=${state.finalized.question_ids?.join(",") || "none"}; tag_context=${state.tagContext.confirmedTagIds.length}`;
    } else {
      logObservation = { error: `Unknown practice tool: ${toolName}` };
      modelObservation = `ERROR unknown_tool=${toolName}`;
      outputSummary = "unknown tool";
    }

    const savedFullPayload = await writePracticeFullCallLog({
      context: { iteration, phase: "recommendation", toolCallId: toolCall.id, toolName },
      event: "tool",
      payload: { args, modelObservation, observation: logObservation },
    });

    await pushTrace(state, {
      elapsedMs: Date.now() - started,
      inputSummary: buildToolDigest([{ args, tool: toolName }]).slice(0, 800),
      iteration,
      outputSummary,
      phase: "recommendation",
      resultCount,
      savedFullPayload,
      thoughtSummary: visibleThought || undefined,
      toolCallId: toolCall.id,
      toolName,
    });

    return makeToolResultMessage(toolCall, modelObservation ?? logObservation);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const savedFullPayload = await writePracticeFullCallLog({
      context: { iteration, phase: "recommendation", toolCallId: toolCall.id, toolName },
      event: "tool_error",
      payload: { args, error: errorMessage },
    });

    await pushTrace(state, {
      elapsedMs: Date.now() - started,
      error: errorMessage,
      inputSummary: buildToolDigest([{ args, tool: toolName }]).slice(0, 800),
      iteration,
      phase: "recommendation",
      savedFullPayload,
      thoughtSummary: visibleThought || undefined,
      toolCallId: toolCall.id,
      toolName,
    });

    return makeToolResultMessage(toolCall, {
      error: errorMessage,
      tool: toolName,
    });
  }
}

function buildSystemPrompt(maxToolCalls: number) {
  return [
    "You are O2I Practice Recommendation Agent.",
    "You are running in a controlled backend tool loop. Backend state and tools are the source of truth.",
    "Available taxonomy facets are fixed and already known: curriculum, concept, method, task, form. Do not call a tool to list facets.",
    "Tool policy: use only browse_taxonomy_batch, practice_search_batch, and finalize_recommendation.",
    "browse_taxonomy_batch is limited to 2 normal calls, with a hard safety cap of 3. Each call has at most 8 requests and each request returns at most 15 tag ids.",
    "searchable_question_count means searchable published approved question count for the full tag subtree, including child tags. direct_question_count is only diagnostic.",
    "browse_taxonomy_batch returns a compact text protocol, not verbose JSON. Example: r1: [{\"t\":\"math.concept.calculus.derivatives.chain_rule\",\"q\":4,\"a\":1,\"c\":0}]. Here t=tag_id, q=searchable subtree question count, a=assignable 1/0, c=children count, d=direct count if present.",
    "If browse finds a concrete is_assignable tag with searchable_question_count > 0, use it directly for strict search. Do not expand children for that tag.",
    "Only browse children when the tag is not assignable, has zero searchable count, or is clearly broad such as math.concept.calculus or integrals.",
    "practice_search_batch is limited to 2 calls. First call must be strict and use only this round's confirmed target tag subtrees. Strict search must not jump to parent tags, neighboring tags, calculus, or integrals just because a specific tag may be sparse.",
    "Second search may be relaxed: use parent tag subtree, adjacent tag subtree, or a small keyword query. When finalizing relaxed candidates, say the match is broader.",
    "practice_search_batch returns thin text: SEARCH_RESULT header, LANE rows, then q blocks with id, question_code, type, difficulty, tags, STEM, and OPTIONS. Use the id= value for finalize_recommendation question_ids.",
    "Example search block: q1 | id=<uuid> | O2I-CALC-HARD-013 | mcq | d=690 | tags=math.concept.calculus.derivatives.chain_rule | match=strict/lane-1; STEM: If G(x)=... what is G'(x)?; OPTIONS: A ...; B ...; C ...; D ...",
    "After two searches, finalize with the current candidate pool. Do not ask for broad_pool. Recommendation phase cannot see answer_spec or solution_html. It can see compact plain-text stems/options only from practice_search_batch.",
    `You have at most ${maxToolCalls} tool calls total including finalize_recommendation.`,
    "Every tool call must include visible_thought: a short UI-safe process summary. This is not private chain-of-thought.",
    "finalize_recommendation must include tag_context for the next round. Keep it compact and reusable.",
  ].join("\n");
}

export async function runPracticeRecommendationAgent({
  completedQuestionIds,
  goal,
  onTrace,
  profile,
  questionCount,
  sessionMemory,
  supabase,
  tagContext,
  trace,
}: {
  completedQuestionIds: string[];
  goal: string;
  onTrace?: (event: PracticeTraceEvent) => void | Promise<void>;
  profile: PracticeProfile;
  questionCount: number;
  sessionMemory?: string;
  supabase: SupabaseLike;
  tagContext?: PracticeTagContext;
  trace: PracticeTraceEvent[];
}) {
  const maxToolCalls = envToolCallLimit();
  const compactMemory = compactSessionMemory(sessionMemory, goal);
  const normalizedTagContext = normalizeTagContext(tagContext, goal);
  const state: ToolExecutionState = {
    browseCallsUsed: 0,
    candidatePool: new Map(),
    completedQuestionIds,
    confirmedTargetTagIds: new Set(normalizedTagContext.confirmedTagIds),
    goal,
    onTrace,
    questionCount,
    searchCallsUsed: 0,
    sessionMemory: compactMemory,
    supabase,
    tagContext: normalizedTagContext,
    trace,
  };
  const messages: PracticeChatMessage[] = [
    { role: "system", content: buildSystemPrompt(maxToolCalls) },
    {
      role: "user",
      content: JSON.stringify({
        available_facets: ["curriculum", "concept", "method", "task", "form"],
        completed_question_ids: completedQuestionIds.slice(-120),
        goal,
        question_count: questionCount,
        session_memory: compactMemory,
        tag_context: normalizedTagContext,
      }),
    },
  ];

  await pushTrace(state, {
    inputSummary:
      "Stable base prompt + fixed facets + compact memory + tag_context. Tool results remain compact and do not include full stems/options.",
    outputSummary: `memory=${compactMemory.length} chars; completed=${completedQuestionIds.length}; tag_context=${normalizedTagContext.confirmedTagIds.length}; max_tool_calls=${maxToolCalls}`,
    phase: "context",
    toolName: "compact_agent_context",
  });

  let providerLabel = "";
  let toolCallsUsed = 0;

  for (let iteration = 1; toolCallsUsed < maxToolCalls; iteration += 1) {
    const tools = availableTools(state);
    await pushTrace(state, {
      inputSummary: `Calling ${profile.name} / ${profile.model} for next tool choice.`,
      iteration,
      outputSummary: [
        `browse=${state.browseCallsUsed}/${SOFT_BROWSE_CALL_LIMIT}`,
        `search=${state.searchCallsUsed}/${SEARCH_CALL_LIMIT}`,
        `tools=${tools.map((tool) => tool.function.name).join(",")}`,
        `pool=${state.candidatePool.size}`,
      ].join("; "),
      phase: "recommendation",
      toolName: "model_tool_choice_start",
    });

    const modelResult = await callPracticeChatModel({
      debugContext: { goal, iteration, phase: "recommendation", questionCount },
      messages,
      profile,
      tools,
    });
    providerLabel = modelResult.providerLabel;

    messages.push(buildAssistantMessageForToolContinuation(modelResult));

    await pushTrace(state, {
      inputSummary: modelResult.contentText.slice(0, 600),
      iteration,
      outputSummary: modelResult.toolCalls.length
        ? `requested tools: ${modelResult.toolCalls.map((toolCall) => toolCall.function.name).join(", ")}`
        : "no tool call requested",
      phase: "recommendation",
      savedFullPayload: modelResult.fullCallLogSaved,
      toolName: "model_tool_choice",
    });

    if (!modelResult.toolCalls.length) {
      await pushTrace(state, {
        error: "Model returned no tool call; stopping loop and using current candidate pool if possible.",
        inputSummary: modelResult.contentText.slice(0, 600),
        iteration,
        outputSummary: modelResult.hasReasoningContent ? "Provider returned hidden reasoning_content; no further tool request is sent from this loop turn." : undefined,
        phase: "recommendation",
        savedFullPayload: modelResult.fullCallLogSaved,
        toolName: "model_tool_choice",
      });
      break;
    }

    const allowedToolNames = new Set(tools.map((tool) => tool.function.name));
    for (const toolCall of modelResult.toolCalls) {
      if (toolCallsUsed >= maxToolCalls) {
        messages.push(await rejectPracticeToolCall({
          iteration,
          reason: "tool call limit already reached",
          state,
          toolCall,
        }));
        continue;
      }

      toolCallsUsed += 1;

      if (state.finalized) {
        messages.push(await rejectPracticeToolCall({
          iteration,
          reason: "recommendation already finalized",
          state,
          toolCall,
        }));
        continue;
      }

      if (!allowedToolNames.has(toolCall.function.name)) {
        messages.push(await rejectPracticeToolCall({
          iteration,
          reason: `tool is not available in this step; available tools: ${Array.from(allowedToolNames).join(",")}`,
          state,
          toolCall,
        }));
        continue;
      }

      const args = parsePracticeToolArguments(toolCall.function.arguments);
      const toolMessage = await executePracticeTool({ args, iteration, state, toolCall });
      messages.push(toolMessage);
    }

    if (state.finalized) {
      break;
    }
  }

  if (!state.finalized) {
    await pushTrace(state, {
      inputSummary: "Tool call limit reached or model stopped before finalization.",
      outputSummary: `candidate_pool_size=${state.candidatePool.size}`,
      phase: "recommendation",
      resultCount: state.candidatePool.size,
      toolName: "tool_call_limit_guard",
    });
  }

  const candidates = Array.from(state.candidatePool.values());
  const recommendations = mapFinalRecommendations({
    candidates,
    count: questionCount,
    finalized: state.finalized,
  });

  return {
    maxToolCalls,
    providerLabel,
    recommendations,
    roundGoal: state.finalized?.round_goal?.trim() || goal,
    sessionMemory: state.finalized?.session_memory?.trim().slice(0, 1600) || compactMemory,
    tagContext: compactTagContext(state.finalized?.tag_context ?? state.tagContext),
  };
}
