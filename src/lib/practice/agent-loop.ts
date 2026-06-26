import "server-only";

import {
  buildAssistantMessageForToolContinuation,
  callPracticeChatModel,
  parsePracticeToolArguments,
  type PracticeChatMessage,
  type PracticeToolCall,
  type PracticeToolDefinition,
} from "@/lib/practice/ai";
import { buildToolDigest, buildUsageEnvelope, stableHash, stableStringify, summarizeLLMUsage, writePracticeFullCallLog, writePracticeStatsLog } from "@/lib/practice/context";
import { loadPracticePrompt } from "@/lib/practice/prompt-loader";
import { CURRENT_PRACTICE_SESSION_SCHEMA_VERSION } from "@/lib/practice/schema";
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
  type BrowseTagResult,
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
  keep_tags?: string[];
  question_ids?: string[];
  reasons?: Record<string, string>;
  round_contract?: Record<string, unknown>;
  round_goal?: string;
  visible_thought?: string;
};

type RetainedBrowseTag = {
  searchableQuestionCount?: number;
  tagId: string;
};

type ToolExecutionState = {
  awaitingBrowseRetention: boolean;
  browseCandidateByTagId: Map<string, BrowseTagResult>;
  browseCallsUsed: number;
  candidatePool: Map<string, PracticeQuestionCandidate>;
  completedQuestionIds: string[];
  confirmedTargetTagIds: Set<string>;
  finalized?: FinalizeArgs;
  goal: string;
  onTrace?: (event: PracticeTraceEvent) => void | Promise<void>;
  questionCount: number;
  retainedBrowseTags: Map<string, RetainedBrowseTag>;
  searchCallsUsed: number;
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
  return stableStringify(value).replace(/\s+/g, " ").slice(0, maxChars);
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
          "A UI-visible process note explaining why this step is useful now and what decision it supports. Do not include hidden chain-of-thought.",
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
        keep_tags: {
          description:
            "Optional full taxonomy tag ids to keep from the immediately preceding browse_taxonomy_batch result. Use only when you just received browse results.",
          items: { type: "string" },
          type: "array",
        },
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
        keep_tags: {
          description:
            "Full taxonomy tag ids to keep from the immediately preceding browse_taxonomy_batch result. Include only right after a browse call.",
          items: { type: "string" },
          type: "array",
        },
        lanes: {
          description: "At most 4 search lanes.",
          items: {
            additionalProperties: false,
            properties: {
              confirmed_tag_ids: { items: { type: "string" }, type: "array" },
              lane_id: { type: "string" },
              limit: { default: 8, minimum: 1, maximum: 16, type: "integer" },
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
        keep_tags: {
          description:
            "Optional final full taxonomy tag ids to keep in backend-generated tag_context. Usually omit unless confirming tags from recent browse/search.",
          items: { type: "string" },
          type: "array",
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
        round_contract: {
          additionalProperties: true,
          description: "Structured contract for this round: plan node, recommendation intent, selected question diagnostic purposes, and drift guard.",
          type: "object",
        },
      },
      [
        "visible_thought",
        "question_ids",
        "reasons",
        "expected_skills",
        "round_goal",
      ],
    ),
  },
};

const ALL_RECOMMENDATION_TOOLS: PracticeToolDefinition[] = [browseTool, searchTool, finalizeTool];

function allowedToolNamesForState(state: ToolExecutionState) {
  const allowed = new Set<string>([finalizeTool.function.name]);

  if (state.searchCallsUsed < SEARCH_CALL_LIMIT) {
    allowed.add(searchTool.function.name);
  }

  if (
    state.browseCallsUsed < SOFT_BROWSE_CALL_LIMIT ||
    (state.browseCallsUsed < HARD_BROWSE_CALL_LIMIT && !state.confirmedTargetTagIds.size)
  ) {
    allowed.add(browseTool.function.name);
  }

  return allowed;
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
      limit: asNumber(record.limit, Math.max(state.questionCount * 2, 8), 1, 16),
      query_text: asString(record.query_text) || undefined,
      rationale: asString(record.rationale, "Candidate search lane."),
    };
  });
}

function rememberBrowseCandidates(state: ToolExecutionState, result: Awaited<ReturnType<typeof browseTaxonomyBatch>>) {
  for (const item of result.results) {
    for (const tag of item.tags) {
      state.browseCandidateByTagId.set(tag.tag_id, tag);
    }
  }

  state.awaitingBrowseRetention = true;
}

function asKeepTags(value: unknown) {
  return asStringArray(value, 16);
}

function retainBrowseTagsById(state: ToolExecutionState, tagIds: string[]) {
  const kept: string[] = [];
  const invalid: string[] = [];

  for (const tagId of Array.from(new Set(tagIds))) {
    const browseTag = state.browseCandidateByTagId.get(tagId);

    if (!browseTag) {
      if (state.confirmedTargetTagIds.has(tagId) || state.tagContext.confirmedTagIds.includes(tagId)) {
        state.retainedBrowseTags.set(tagId, { tagId });
        kept.push(tagId);
        continue;
      }
      invalid.push(tagId);
      continue;
    }

    state.retainedBrowseTags.set(tagId, {
      searchableQuestionCount: browseTag.searchable_question_count,
      tagId,
    });
    if (browseTag.is_assignable && browseTag.searchable_question_count > 0) {
      state.confirmedTargetTagIds.add(tagId);
    }
    kept.push(tagId);
  }

  return { invalid, kept };
}

function processKeepTags({
  args,
  state,
  toolName,
}: {
  args: Record<string, unknown>;
  state: ToolExecutionState;
  toolName: string;
}) {
  const requested = asKeepTags(args.keep_tags);
  const warnings: string[] = [];
  let kept: string[] = [];
  let invalid: string[] = [];

  if (requested.length) {
    const result = retainBrowseTagsById(state, requested);
    kept = result.kept;
    invalid = result.invalid;

    if (!state.awaitingBrowseRetention && toolName !== "finalize_recommendation") {
      warnings.push("keep_tags is only needed immediately after browse_taxonomy_batch; extra keep_tags was ignored except for valid recent browse tag ids.");
    }
    if (invalid.length) {
      warnings.push(`Unknown keep_tags ignored: ${invalid.slice(0, 6).join(",")}. Use full tag_id values from the latest browse result.`);
    }
  } else if (state.awaitingBrowseRetention) {
    warnings.push("No keep_tags provided after browse_taxonomy_batch; unsearched browse-only tags will be folded unless used in this tool call.");
  }

  if (state.awaitingBrowseRetention) {
    state.awaitingBrowseRetention = false;
  }

  return { invalid, kept, requested, warnings };
}

function buildGeneratedTagContext(state: ToolExecutionState): PracticeTagContext {
  return compactTagContext({
    confirmedTagIds: [
      ...state.tagContext.confirmedTagIds,
      ...Array.from(state.confirmedTargetTagIds),
      ...Array.from(state.retainedBrowseTags.keys()),
    ],
    lastGoal: state.goal,
    usefulTags: [
      ...state.tagContext.usefulTags,
      ...Array.from(state.retainedBrowseTags.values()).map((tag) => ({
        searchableQuestionCount: tag.searchableQuestionCount,
        source: "browse" as const,
        tagId: tag.tagId,
      })),
    ],
    version: 1,
  });
}

function mergeSearchIntoTagContext(state: ToolExecutionState, result: Awaited<ReturnType<typeof practiceSearchBatch>>) {
  const searchedTags = result.laneSummaries.flatMap((lane) => lane.effective_tags);
  const matchedTags = result.candidates.flatMap((candidate) => candidate.tagIds);

  for (const tagId of searchedTags) {
    state.confirmedTargetTagIds.add(tagId);
  }

  state.tagContext = compactTagContext({
    confirmedTagIds: [
      ...buildGeneratedTagContext(state).confirmedTagIds,
      ...Array.from(state.confirmedTargetTagIds),
      ...searchedTags,
    ],
    lastGoal: state.goal,
    usefulTags: [
      ...buildGeneratedTagContext(state).usefulTags,
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
  const visibleThought = asString(args.visible_thought).slice(0, 2000);
  const started = Date.now();

  try {
    const retention = processKeepTags({ args, state, toolName });
    let logObservation: unknown;
    let modelObservation: unknown;
    let resultCount: number | undefined;
    let outputSummary = "";

    if (toolName === "browse_taxonomy_batch") {
      state.browseCallsUsed += 1;
      const requests = asBrowseRequests(args.requests);
      const result = await browseTaxonomyBatch({ requests, supabase: state.supabase });
      rememberBrowseCandidates(state, result);
      logObservation = result;
      modelObservation = [
        formatBrowseTaxonomyBatchForModel(result),
        "NEXT_CALL_REQUIREMENT: if any browsed tag should remain in context, include keep_tags with full tag_id values on your next tool call. Do not use short refs.",
        ...retention.warnings.map((warning) => `KEEP_TAGS_NOTE: ${warning}`),
      ].join("\n");
      resultCount = result.results.reduce((sum, item) => sum + item.tags.length, 0);
      outputSummary = [
        `browse_call=${state.browseCallsUsed}/${SOFT_BROWSE_CALL_LIMIT}`,
        `requests=${result.results.length}`,
        `retained=${state.retainedBrowseTags.size}`,
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
        tag_retention: {
          invalid: retention.invalid,
          kept: retention.kept,
          warnings: retention.warnings,
        },
      };
      modelObservation = [
        ...retention.warnings.map((warning) => `KEEP_TAGS_NOTE: ${warning}`),
        formatPracticeSearchBatchForModel({
          mode,
          poolSize: state.candidatePool.size,
          questionCount: state.questionCount,
          result,
        }),
      ].filter(Boolean).join("\n");
      resultCount = result.shortCandidates.length;
      outputSummary = [
        `search_call=${state.searchCallsUsed}/${SEARCH_CALL_LIMIT}`,
        `mode=${mode}`,
        `lanes=${result.laneSummaries.map((lane) => `${lane.lane_id}:${lane.result_count}:${lane.match_quality}`).join(",")}`,
        `pool=${state.candidatePool.size}`,
        retention.warnings.length ? `keep_tags_note=${retention.warnings.length}` : "",
      ].filter(Boolean).join("; ");
    } else if (toolName === "finalize_recommendation") {
      const generatedTagContext = buildGeneratedTagContext(state);
      state.finalized = {
        expected_skills: typeof args.expected_skills === "object" && args.expected_skills ? args.expected_skills as Record<string, string> : {},
        keep_tags: retention.kept,
        question_ids: asStringArray(args.question_ids),
        reasons: typeof args.reasons === "object" && args.reasons ? args.reasons as Record<string, string> : {},
        round_contract: typeof args.round_contract === "object" && args.round_contract
          ? args.round_contract as Record<string, unknown>
          : undefined,
        round_goal: asString(args.round_goal, state.goal),
        visible_thought: visibleThought,
      };
      state.tagContext = generatedTagContext;
      logObservation = {
        accepted: true,
        candidate_pool_size: state.candidatePool.size,
        selected_question_ids: state.finalized.question_ids,
        tag_context_size: state.tagContext.confirmedTagIds.length,
        tag_retention: {
          invalid: retention.invalid,
          kept: retention.kept,
          warnings: retention.warnings,
        },
      };
      modelObservation = [
        ...retention.warnings.map((warning) => `KEEP_TAGS_NOTE: ${warning}`),
        `FINALIZE accepted=true selected=${state.finalized.question_ids?.join(",") || "none"} pool=${state.candidatePool.size} tag_context=${state.tagContext.confirmedTagIds.length}`,
      ].filter(Boolean).join("\n");
      resultCount = state.finalized.question_ids?.length ?? 0;
      outputSummary = `selected=${state.finalized.question_ids?.join(",") || "none"}; tag_context=${state.tagContext.confirmedTagIds.length}${retention.warnings.length ? `; keep_tags_note=${retention.warnings.length}` : ""}`;
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
      inputPayload: { args, tool: toolName },
      iteration,
      outputSummary,
      outputPayload: logObservation,
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
      inputPayload: { args, tool: toolName },
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

async function buildSystemPrompt(maxToolCalls: number) {
  const prompt = await loadPracticePrompt("recommendation-system");
  return prompt.replaceAll("{{MAX_TOOL_CALLS}}", String(maxToolCalls));
}

function compactThreadMessages(value: unknown, limit = 24) {
  return Array.isArray(value) ? value.slice(-limit) : [];
}

function buildRecommendationPromptParts({
  cachePrefixVersion,
  completedQuestionIds,
  courseFrameworkSnapshot,
  goal,
  longTermMemory,
  outlineUserNotes,
  questionCount,
  sessionPlan,
  sessionThreadMessages,
  tagContext,
  userNextRoundNote,
}: {
  cachePrefixVersion?: string;
  completedQuestionIds: string[];
  courseFrameworkSnapshot?: unknown;
  goal: string;
  longTermMemory?: string;
  outlineUserNotes?: string;
  questionCount: number;
  sessionPlan?: unknown;
  sessionThreadMessages?: unknown;
  tagContext: PracticeTagContext;
  userNextRoundNote?: string;
}) {
  const stablePrefix = {
    cache_policy: {
      cache_prefix_version: cachePrefixVersion ?? CURRENT_PRACTICE_SESSION_SCHEMA_VERSION,
      dynamic_suffix_rule: "All volatile ids, current answers, current user notes, completed ids, and tool results stay after this stable prefix.",
      tools_schema_policy: "The backend always sends the same tool schema; per-step availability is controlled by tool_policy in the suffix.",
    },
    course_framework: courseFrameworkSnapshot ?? null,
    session_plan: sessionPlan ?? null,
    thread_policy: {
      current_call: "recommend_next_round",
      inheritance: "Use append-only current task entries, episode cards, and thread checkpoints as the main thread.",
      user_opinion_priority: "User outline notes and next-round notes are appended at the tail and should outweigh automatic assumptions when safe.",
    },
  };

  const threadEntries = compactThreadMessages(sessionThreadMessages).map((entry, index) => ({
    content: stableStringify(entry),
    name: `practice_thread_${index + 1}`,
    role: "assistant" as const,
  }));

  const dynamicSuffix = {
    available_facets: ["curriculum", "concept", "method", "task", "form"],
    completed_question_ids: completedQuestionIds.slice(-160),
    current_round_request: {
      goal,
      question_count: questionCount,
      user_next_round_note: userNextRoundNote?.trim() || "",
    },
    memory_context: {
      long_term_memory: longTermMemory?.trim() || "No long-term memory yet.",
      snapshot_policy: "This is the long-term memory snapshot locked when the session was created. Do not assume later global preference edits apply to this session.",
    },
    tag_context: tagContext,
    tool_policy: {
      browse_taxonomy_batch: "allowed until browse limit or confirmed tag context is enough",
      finalize_recommendation: "always available; required to finish",
      practice_search_batch: "allowed until search limit",
    },
    user_outline_notes: outlineUserNotes?.trim() || "",
    volatile_notice: "This suffix intentionally contains changing IDs, user notes, current goal, completed ids, tags, and locked memory to protect the cached prefix.",
  };

  return { dynamicSuffix, stablePrefix, threadEntries };
}

export async function runPracticeRecommendationAgent({
  cachePrefixVersion,
  completedQuestionIds,
  courseFrameworkSnapshot,
  goal,
  longTermMemory,
  onTrace,
  outlineUserNotes,
  profile,
  questionCount,
  sessionPlan,
  sessionThreadMessages,
  supabase,
  tagContext,
  trace,
  userNextRoundNote,
}: {
  cachePrefixVersion?: string;
  completedQuestionIds: string[];
  courseFrameworkSnapshot?: unknown;
  goal: string;
  longTermMemory?: string;
  onTrace?: (event: PracticeTraceEvent) => void | Promise<void>;
  outlineUserNotes?: string;
  profile: PracticeProfile;
  questionCount: number;
  sessionPlan?: unknown;
  sessionThreadMessages?: unknown;
  supabase: SupabaseLike;
  tagContext?: PracticeTagContext;
  trace: PracticeTraceEvent[];
  userNextRoundNote?: string;
}) {
  const maxToolCalls = envToolCallLimit();
  const normalizedTagContext = normalizeTagContext(tagContext, goal);
  const state: ToolExecutionState = {
    awaitingBrowseRetention: false,
    browseCandidateByTagId: new Map(),
    browseCallsUsed: 0,
    candidatePool: new Map(),
    completedQuestionIds,
    confirmedTargetTagIds: new Set(normalizedTagContext.confirmedTagIds),
    goal,
    onTrace,
    questionCount,
    retainedBrowseTags: new Map(),
    searchCallsUsed: 0,
    supabase,
    tagContext: normalizedTagContext,
    trace,
  };
  const systemPrompt = await buildSystemPrompt(maxToolCalls);
  const { dynamicSuffix, stablePrefix, threadEntries } = buildRecommendationPromptParts({
    cachePrefixVersion,
    completedQuestionIds,
    courseFrameworkSnapshot,
    goal,
    longTermMemory,
    outlineUserNotes,
    questionCount,
    sessionPlan,
    sessionThreadMessages,
    tagContext: normalizedTagContext,
    userNextRoundNote,
  });
  const messages: PracticeChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: stableStringify(stablePrefix) },
    ...threadEntries,
    { role: "user", content: stableStringify(dynamicSuffix) },
  ];

  await pushTrace(state, {
    inputSummary:
      "Cache-first context: stable prefix + append-only episode cards + volatile tail suffix. Dynamic IDs and user notes are kept at the tail.",
    outputSummary: `prefix_hash=${stableHash(stablePrefix)}; suffix_hash=${stableHash(dynamicSuffix)}; thread_entries=${threadEntries.length}; locked_memory=${(longTermMemory ?? "").trim().length} chars; completed=${completedQuestionIds.length}; tag_context=${normalizedTagContext.confirmedTagIds.length}; max_tool_calls=${maxToolCalls}`,
    phase: "context",
    toolName: "compact_agent_context",
  });

  let providerLabel = "";
  let toolCallsUsed = 0;
  const llmUsage: Record<string, unknown>[] = [];

  for (let iteration = 1; toolCallsUsed < maxToolCalls; iteration += 1) {
    const tools = ALL_RECOMMENDATION_TOOLS;
    const allowedToolNames = allowedToolNamesForState(state);
    await pushTrace(state, {
      inputSummary: `Calling ${profile.name} / ${profile.model} for next tool choice.`,
      iteration,
      outputSummary: [
        `browse=${state.browseCallsUsed}/${SOFT_BROWSE_CALL_LIMIT}`,
        `search=${state.searchCallsUsed}/${SEARCH_CALL_LIMIT}`,
        `tools=${tools.map((tool) => tool.function.name).join(",")}`,
        `allowed=${Array.from(allowedToolNames).join(",")}`,
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
    if (modelResult.usage) {
      const usageEnvelope = buildUsageEnvelope({
        cachePrefixVersion,
        phase: "recommendation",
        prefixPayload: stablePrefix,
        providerLabel,
        suffixPayload: dynamicSuffix,
        usage: modelResult.usage,
      });
      llmUsage.push({ iteration, ...usageEnvelope });
      void writePracticeStatsLog({
        context: { goal, iteration, phase: "recommendation", questionCount },
        payload: usageEnvelope,
      });
    }

    messages.push(buildAssistantMessageForToolContinuation(modelResult));

    await pushTrace(state, {
      inputSummary: modelResult.contentText.slice(0, 600),
      iteration,
      modelThought: modelResult.contentText,
      outputSummary: modelResult.toolCalls.length
        ? `requested tools: ${modelResult.toolCalls.map((toolCall) => toolCall.function.name).join(", ")}`
        : "no tool call requested",
      phase: "recommendation",
      reasoningContent: modelResult.reasoningContent,
      llmUsage: modelResult.usage,
      savedFullPayload: modelResult.fullCallLogSaved,
      toolName: "model_tool_choice",
    });
    if (modelResult.usage) {
      await pushTrace(state, {
        inputSummary: "Provider usage for prompt caching/token monitoring.",
        iteration,
        llmUsage: modelResult.usage,
        outputSummary: summarizeLLMUsage(modelResult.usage),
        phase: "recommendation",
        toolName: "model_usage",
      });
    }

    if (!modelResult.toolCalls.length) {
      await pushTrace(state, {
        error: "Model returned no tool call; stopping loop and using current candidate pool if possible.",
        inputSummary: modelResult.contentText.slice(0, 600),
        iteration,
        modelThought: modelResult.contentText,
        outputSummary: modelResult.hasReasoningContent ? "Provider returned hidden reasoning_content; no further tool request is sent from this loop turn." : undefined,
        phase: "recommendation",
        reasoningContent: modelResult.reasoningContent,
        savedFullPayload: modelResult.fullCallLogSaved,
        toolName: "model_tool_choice",
      });
      break;
    }

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
    currentTaskSuffix: dynamicSuffix,
    llmUsage,
    recommendations,
    roundContract: state.finalized?.round_contract ?? null,
    roundGoal: state.finalized?.round_goal?.trim() || goal,
    sessionMemory: "",
    sessionState: null,
    tagContext: buildGeneratedTagContext(state),
  };
}
