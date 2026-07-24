import "server-only";

import { htmlToPlainTextExcerpt } from "@/lib/html/excerpt";
import { normalizeQuestionOptions } from "@/lib/questions/answer-spec";
import type {
  PracticeInventory,
  PracticeQuestionCandidate,
} from "@/lib/practice/types";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";
import type { Question, QuestionType } from "@/types/database";

type SupabaseLike = {
  from: (...args: any[]) => any;
  rpc: (...args: any[]) => any;
};

const BROWSE_REQUEST_LIMIT = 8;
const BROWSE_TAG_LIMIT = 15;
const SEARCH_LANE_LIMIT = 4;
const DEFAULT_SEARCH_LIMIT = 8;
const SEARCH_BUFFER_MULTIPLIER = 3;

type TaxonomyNodeLite = {
  aliases: string[];
  description?: string | null;
  facet_key?: string | null;
  is_assignable?: boolean;
  label: string;
  parent_tag_ids: string[];
  tag_id: string;
};

export type BrowseTaxonomyBatchRequest = {
  guess_path?: string;
  parent_tag_id?: string;
  query?: string;
  request_id: string;
  source: "goal" | "tag_context" | "strict_gap" | "relaxed_planning";
};

export type BrowseTagResult = {
  children_count: number;
  direct_question_count: number;
  is_assignable: boolean;
  matched_keywords?: string[];
  searchable_question_count: number;
  tag_id: string;
};

export type BrowseTaxonomyBatchResult = {
  results: Array<{
    request_id: string;
    source: string;
    tags: BrowseTagResult[];
    truncated: boolean;
  }>;
  truncated_requests: boolean;
};

export type PracticeSearchMode = "strict" | "relaxed";

export type PracticeSearchBatchLane = {
  confirmed_tag_ids: string[];
  lane_id: string;
  limit?: number;
  query_text?: string;
  rationale: string;
};

type PracticeSearchShortCandidate = {
  difficulty: number;
  id: string;
  match_quality: "strict" | "relaxed" | "keyword";
  match_source: string;
  question_code: string;
  question_type: QuestionType;
  selection_state: "unseen" | "needs_retry";
  tag_ids: string[];
  title_excerpt: string;
};

export type PracticeSearchBatchResult = {
  candidates: PracticeQuestionCandidate[];
  inventory: PracticeInventory;
  laneSummaries: Array<{
    effective_tags: string[];
    lane_id: string;
    match_quality: "strict" | "relaxed" | "keyword" | "empty";
    mode: PracticeSearchMode;
    inventory: PracticeInventory;
    requested_tags: string[];
    result_count: number;
  }>;
  shortCandidates: PracticeSearchShortCandidate[];
};

export function formatBrowseTaxonomyBatchForModel(result: BrowseTaxonomyBatchResult) {
  const lines = [
    `BROWSE_RESULT requests=${result.results.length} truncated=${result.truncated_requests ? "true" : "false"}`,
    "Legend: t=tag_id, q=searchable subtree question count, a=assignable 1/0, c=children count, d=direct question count, m=query keywords matched on this node's terminal content.",
  ];

  for (const item of result.results) {
    const compactTags = item.tags.map((tag) => ({
      t: tag.tag_id,
      q: tag.searchable_question_count,
      a: tag.is_assignable ? 1 : 0,
      c: tag.children_count,
      ...(tag.direct_question_count ? { d: tag.direct_question_count } : {}),
      ...(tag.matched_keywords?.length ? { m: tag.matched_keywords } : {}),
    }));
    lines.push(`${item.request_id}: ${JSON.stringify(compactTags)}${item.truncated ? " truncated=true" : ""}`);
  }

  return lines.join("\n");
}

function cleanProtocolText(value: string, maxLength: number) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[\r\n|]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function stemForModel(candidate: PracticeQuestionCandidate) {
  return cleanProtocolText(htmlToPlainTextExcerpt(candidate.contentHtml, 620), 620);
}

function optionsForModel(candidate: PracticeQuestionCandidate) {
  if (!candidate.options.length) {
    return "none";
  }

  return candidate.options
    .slice(0, 6)
    .map((option) => {
      const label = cleanProtocolText(option.label || "?", 12);
      const content = cleanProtocolText(htmlToPlainTextExcerpt(option.content_html, 130), 130);
      return `${label} ${content}`.trim();
    })
    .join("; ");
}

function shortTagId(tagId: string) {
  return tagId.split(".").filter(Boolean).pop() ?? tagId;
}

function shortTagIds(tagIds: string[]) {
  return Array.from(new Set(tagIds.map(shortTagId).filter(Boolean)));
}

export function formatPracticeSearchBatchForModel({
  mode,
  poolSize,
  questionCount,
  result,
}: {
  mode: PracticeSearchMode;
  poolSize: number;
  questionCount: number;
  result: PracticeSearchBatchResult;
}) {
  const returned = result.candidates.length;
  const lines = [
    `SEARCH_RESULT enough=${poolSize >= questionCount ? "true" : "false"} pool=${poolSize} mode=${mode} returned=${returned} inventory=${JSON.stringify(result.inventory)}`,
  ];

  for (const lane of result.laneSummaries) {
    lines.push(
      `LANE ${lane.lane_id} mode=${lane.mode} tags=${lane.effective_tags.join(",") || "none"} results=${lane.result_count} quality=${lane.match_quality} inventory=${JSON.stringify(lane.inventory)}`,
    );
  }

  result.candidates.forEach((candidate, index) => {
    const short = result.shortCandidates.find((item) => item.id === candidate.id);
    lines.push("");
    lines.push(
      [
        `q${index + 1}`,
        `id=${candidate.id}`,
        candidate.questionCode,
        candidate.questionType,
        `d=${candidate.difficulty}`,
        `tags=${shortTagIds(candidate.tagIds).slice(0, 8).join(",") || "none"}`,
        `match=${short?.match_quality ?? mode}/${short?.match_source ?? "unknown"}`,
        `state=${candidate.selectionState ?? "unseen"}`,
      ].join(" | "),
    );
    lines.push(`STEM: ${stemForModel(candidate)}`);
    lines.push(`OPTIONS: ${optionsForModel(candidate)}`);
  });

  return lines.join("\n").slice(0, 12000);
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_. -]+/g, " ")
    .split(/[\s_.-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
}

function terminalTagSegment(tagId: string) {
  return tagId.split(".").filter(Boolean).pop() ?? tagId;
}

function terminalSearchText(node: TaxonomyNodeLite) {
  return [
    terminalTagSegment(node.tag_id),
    node.label,
    ...node.aliases,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function nodeHaystack(node: TaxonomyNodeLite) {
  return [node.tag_id, node.label, node.description, node.facet_key, ...node.aliases]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function nodeScore(node: TaxonomyNodeLite, tokens: string[]) {
  const haystack = nodeHaystack(node);
  let score = 0;

  for (const token of tokens) {
    if (node.tag_id.toLowerCase().includes(token)) score += 5;
    if (node.label.toLowerCase().includes(token)) score += 4;
    if (haystack.includes(token)) score += 2;
  }

  if (node.is_assignable) score += 1;
  if (node.facet_key === "concept") score += 1;
  if (node.facet_key === "method") score += 1;

  return score;
}

function questionToCandidate(question: Pick<
  Question,
  | "id"
  | "question_code"
  | "title"
  | "content_html"
  | "difficulty_rating"
  | "options"
  | "question_type"
  | "source"
>, tagIds: string[], selectionState?: "unseen" | "needs_retry"): PracticeQuestionCandidate {
  return {
    contentExcerpt: htmlToPlainTextExcerpt(question.content_html, 520),
    contentHtml: question.content_html,
    difficulty: question.difficulty_rating,
    id: question.id,
    options: normalizeQuestionOptions(question.options),
    questionCode: question.question_code,
    questionType: question.question_type,
    source: question.source,
    sourceQuestionId: question.id,
    selectionState,
    tagIds,
    title: question.title,
  };
}

function buildChildrenByParent(nodes: TaxonomyNodeLite[]) {
  const childrenByParent = new Map<string, TaxonomyNodeLite[]>();

  for (const node of nodes) {
    for (const parentTagId of node.parent_tag_ids) {
      childrenByParent.set(parentTagId, [
        ...(childrenByParent.get(parentTagId) ?? []),
        node,
      ]);
    }
  }

  for (const children of childrenByParent.values()) {
    children.sort((left, right) => left.tag_id.localeCompare(right.tag_id));
  }

  return childrenByParent;
}

function descendantTagIds(tagId: string, childrenByParent: Map<string, TaxonomyNodeLite[]>) {
  const seen = new Set<string>();
  const pending = [tagId];

  while (pending.length) {
    const current = pending.pop();
    if (!current || seen.has(current)) {
      continue;
    }

    seen.add(current);
    for (const child of childrenByParent.get(current) ?? []) {
      pending.push(child.tag_id);
    }
  }

  return seen;
}

async function loadQuestionCounts({
  childrenByParent,
  supabase,
}: {
  childrenByParent: Map<string, TaxonomyNodeLite[]>;
  supabase: SupabaseLike;
}) {
  const { data, error } = await supabase
    .from("question_taxonomy_assignments")
    .select("question_id,tag_id,questions!inner(status)")
    .eq("review_status", "approved")
    .eq("questions.status", "published");

  if (error) {
    throw new Error(error.message);
  }

  const directQuestionsByTag = new Map<string, Set<string>>();

  for (const row of (data ?? []) as Array<{ question_id: string; tag_id: string }>) {
    directQuestionsByTag.set(row.tag_id, directQuestionsByTag.get(row.tag_id) ?? new Set());
    directQuestionsByTag.get(row.tag_id)?.add(row.question_id);
  }

  const directCountByTag = new Map<string, number>();
  const searchableCountByTag = new Map<string, number>();

  for (const [tagId, questionIds] of directQuestionsByTag) {
    directCountByTag.set(tagId, questionIds.size);
  }

  const allTagIds = new Set<string>([
    ...childrenByParent.keys(),
    ...directQuestionsByTag.keys(),
    ...Array.from(childrenByParent.values()).flatMap((children) => children.map((child) => child.tag_id)),
  ]);

  for (const tagId of allTagIds) {
    const searchableQuestionIds = new Set<string>();
    for (const descendantId of descendantTagIds(tagId, childrenByParent)) {
      for (const questionId of directQuestionsByTag.get(descendantId) ?? []) {
        searchableQuestionIds.add(questionId);
      }
    }
    searchableCountByTag.set(tagId, searchableQuestionIds.size);
  }

  return { directCountByTag, searchableCountByTag };
}

function statsForNode({
  childrenByParent,
  directCountByTag,
  matchedKeywords,
  node,
  searchableCountByTag,
}: {
  childrenByParent: Map<string, TaxonomyNodeLite[]>;
  directCountByTag: Map<string, number>;
  matchedKeywords?: string[];
  node: TaxonomyNodeLite;
  searchableCountByTag: Map<string, number>;
}): BrowseTagResult {
  return {
    children_count: childrenByParent.get(node.tag_id)?.length ?? 0,
    direct_question_count: directCountByTag.get(node.tag_id) ?? 0,
    is_assignable: Boolean(node.is_assignable),
    matched_keywords: matchedKeywords?.length ? matchedKeywords : undefined,
    searchable_question_count: searchableCountByTag.get(node.tag_id) ?? 0,
    tag_id: node.tag_id,
  };
}

function terminalQueryMatches(nodes: TaxonomyNodeLite[], query: string) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  return nodes
    .map((node) => {
      const terminalText = terminalSearchText(node);
      const matchedKeywords = tokens.filter((token) => terminalText.includes(token));
      return { matchedKeywords, node };
    })
    .filter((item) => item.matchedKeywords.length > 0)
    .sort(
      (left, right) =>
        right.matchedKeywords.length - left.matchedKeywords.length ||
        left.node.tag_id.localeCompare(right.node.tag_id),
    );
}

function rankedQueryMatches(nodes: TaxonomyNodeLite[], query: string) {
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  return nodes
    .map((node) => ({ node, score: nodeScore(node, tokens) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.node.tag_id.localeCompare(right.node.tag_id))
    .map((item) => item.node);
}

function guessPathMatches(nodesById: Map<string, TaxonomyNodeLite>, guessPath: string) {
  const normalized = guessPath.trim();
  if (!normalized) return [];

  const exact = nodesById.get(normalized);
  if (exact) return [exact];

  const suffix = normalized.replace(/^math\./, "");
  return Array.from(nodesById.values()).filter(
    (node) => node.tag_id.endsWith(suffix) || node.tag_id.includes(`.${suffix}.`),
  );
}

export async function browseTaxonomyBatch({
  requests,
  supabase,
}: {
  requests: BrowseTaxonomyBatchRequest[];
  supabase: SupabaseLike;
}): Promise<BrowseTaxonomyBatchResult> {
  const { catalog, errorMessage } = await loadTaxonomyCatalog(supabase);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  const nodes: TaxonomyNodeLite[] = catalog.nodes.map((node) => ({
    aliases: node.aliases ?? [],
    description: node.description,
    facet_key: node.facet_key,
    is_assignable: node.is_assignable,
    label: node.label,
    parent_tag_ids: node.parent_tag_ids ?? [],
    tag_id: node.tag_id,
  }));
  const nodesById = new Map(nodes.map((node) => [node.tag_id, node]));
  const childrenByParent = buildChildrenByParent(nodes);
  const { directCountByTag, searchableCountByTag } = await loadQuestionCounts({ childrenByParent, supabase });
  const limitedRequests = requests.slice(0, BROWSE_REQUEST_LIMIT);

  return {
    results: limitedRequests.map((request) => {
      const candidateMap = new Map<string, TaxonomyNodeLite>();
      const matchedKeywordsByTagId = new Map<string, string[]>();

      if (request.parent_tag_id) {
        for (const child of childrenByParent.get(request.parent_tag_id) ?? []) {
          candidateMap.set(child.tag_id, child);
        }
      }

      if (request.guess_path) {
        for (const node of guessPathMatches(nodesById, request.guess_path)) {
          candidateMap.set(node.tag_id, node);
          for (const child of childrenByParent.get(node.tag_id) ?? []) {
            candidateMap.set(child.tag_id, child);
          }
        }
      }

      if (request.query) {
        const terminalMatches = terminalQueryMatches(nodes, request.query);

        for (const item of terminalMatches) {
          candidateMap.set(item.node.tag_id, item.node);
          matchedKeywordsByTagId.set(item.node.tag_id, item.matchedKeywords);
        }

        if (!terminalMatches.length) {
          for (const node of rankedQueryMatches(nodes, request.query)) {
            if (!candidateMap.has(node.tag_id)) {
              candidateMap.set(node.tag_id, node);
            }
          }
        }
      }

      const candidates = Array.from(candidateMap.values())
        .sort((left, right) => {
          const rightCount = searchableCountByTag.get(right.tag_id) ?? 0;
          const leftCount = searchableCountByTag.get(left.tag_id) ?? 0;
          return rightCount - leftCount || left.tag_id.localeCompare(right.tag_id);
        });
      const limitedTags = candidates.slice(0, BROWSE_TAG_LIMIT).map((node) =>
        statsForNode({
          childrenByParent,
          directCountByTag,
          matchedKeywords: matchedKeywordsByTagId.get(node.tag_id),
          node,
          searchableCountByTag,
        }),
      );

      return {
        request_id: request.request_id,
        source: request.source,
        tags: limitedTags,
        truncated: candidates.length > BROWSE_TAG_LIMIT,
      };
    }),
    truncated_requests: requests.length > BROWSE_REQUEST_LIMIT,
  };
}

function uniqueStrings(values: string[], limit = 32) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

function searchLimit(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(16, Math.max(1, Math.trunc(parsed))) : fallback;
}

function matchQuality(mode: PracticeSearchMode, tags: string[], queryText: string | undefined) {
  if (mode === "strict") return "strict" as const;
  if (tags.length) return "relaxed" as const;
  return queryText ? "keyword" as const : "relaxed" as const;
}

type PracticeSearchRow = {
  difficulty_rating: number;
  laneId: string;
  matchQuality: "strict" | "relaxed" | "keyword";
  matched_tag_ids?: string[];
  question_code: string;
  question_id: string;
  question_type: QuestionType;
  selection_state: "unseen" | "needs_retry";
  title: string;
};

function addUniqueCandidateRow({
  candidateRows,
  row,
  seenQuestionIds,
  visibleCandidateCap,
}: {
  candidateRows: PracticeSearchRow[];
  row: PracticeSearchRow;
  seenQuestionIds: Set<string>;
  visibleCandidateCap: number;
}) {
  if (candidateRows.length >= visibleCandidateCap || seenQuestionIds.has(row.question_id)) {
    return false;
  }

  seenQuestionIds.add(row.question_id);
  candidateRows.push(row);
  return true;
}

function allocateVisibleRowsFairly({
  candidateRows,
  laneRows,
  seenQuestionIds,
  visibleCandidateCap,
}: {
  candidateRows: PracticeSearchRow[];
  laneRows: PracticeSearchRow[][];
  seenQuestionIds: Set<string>;
  visibleCandidateCap: number;
}) {
  const nonEmptyLaneCount = laneRows.filter((rows) => rows.length > 0).length;
  const guaranteedPerLane = nonEmptyLaneCount
    ? Math.max(1, Math.min(2, Math.floor(visibleCandidateCap / nonEmptyLaneCount)))
    : 0;
  const cursors = laneRows.map(() => 0);

  const addNextUniqueFromLane = (laneIndex: number) => {
    const rows = laneRows[laneIndex] ?? [];

    while (cursors[laneIndex] < rows.length) {
      const row = rows[cursors[laneIndex]];
      cursors[laneIndex] += 1;

      if (addUniqueCandidateRow({ candidateRows, row, seenQuestionIds, visibleCandidateCap })) {
        return true;
      }
    }

    return false;
  };

  for (let round = 0; round < guaranteedPerLane; round += 1) {
    for (let laneIndex = 0; laneIndex < laneRows.length; laneIndex += 1) {
      addNextUniqueFromLane(laneIndex);
    }
  }

  while (candidateRows.length < visibleCandidateCap) {
    let addedThisRound = false;

    for (let laneIndex = 0; laneIndex < laneRows.length; laneIndex += 1) {
      addedThisRound = addNextUniqueFromLane(laneIndex) || addedThisRound;

      if (candidateRows.length >= visibleCandidateCap) {
        break;
      }
    }

    if (!addedThisRound) {
      break;
    }
  }
}

export async function practiceSearchBatch({
  difficultyMax = 1000,
  difficultyMin = 0,
  lanes,
  mode,
  questionCount,
  sessionId,
  supabase,
}: {
  difficultyMax?: number;
  difficultyMin?: number;
  lanes: PracticeSearchBatchLane[];
  mode: PracticeSearchMode;
  questionCount: number;
  sessionId: string;
  supabase: SupabaseLike;
}): Promise<PracticeSearchBatchResult> {
  const limitedLanes = lanes.slice(0, SEARCH_LANE_LIMIT);
  const searchLanes = mode === "relaxed" &&
    !limitedLanes.some((lane) =>
      !uniqueStrings(lane.confirmed_tag_ids).length && !lane.query_text?.trim()
    )
    ? [
        ...limitedLanes.slice(0, SEARCH_LANE_LIMIT - 1),
        {
          confirmed_tag_ids: [],
          lane_id: "session_scope_fallback",
          limit: Math.max(DEFAULT_SEARCH_LIMIT, questionCount),
          query_text: "",
          rationale: "Use the authorized session scope when taxonomy or keyword matching is sparse.",
        },
      ]
    : limitedLanes;
  const visibleCandidateCap = Math.max(1, Math.trunc(questionCount) * 2);
  const candidateRows: PracticeSearchRow[] = [];
  const laneRows: PracticeSearchRow[][] = [];
  const laneSummaries: PracticeSearchBatchResult["laneSummaries"] = [];
  const seenQuestionIds = new Set<string>();
  const emptyInventory: PracticeInventory = {
    deferred: 0,
    eligible: 0,
    mastered: 0,
    needsRetry: 0,
    ungraded: 0,
    unseen: 0,
  };

  for (const lane of searchLanes) {
    const requestedTags = uniqueStrings(lane.confirmed_tag_ids);
    const effectiveTags = mode === "strict" ? requestedTags : requestedTags;
    const normalizedQueryText = mode === "relaxed" ? lane.query_text?.slice(0, 120) || null : null;
    const limit = searchLimit(lane.limit, Math.max(DEFAULT_SEARCH_LIMIT, visibleCandidateCap));
    const quality = matchQuality(mode, effectiveTags, normalizedQueryText ?? undefined);
    const result = await supabase.rpc("search_practice_questions_in_session", {
      p_difficulty_max: Math.min(1000, Math.max(0, Math.trunc(difficultyMax))),
      p_difficulty_min: Math.min(1000, Math.max(0, Math.trunc(difficultyMin))),
      p_include_tag_ids: effectiveTags,
      p_page_limit: Math.max(limit * SEARCH_BUFFER_MULTIPLIER, visibleCandidateCap),
      p_query_text: normalizedQueryText,
      p_session_id: sessionId,
    });

    if (result.error) {
      throw new Error(result.error.message ?? "Question search failed.");
    }

    const rawRows = (Array.isArray(result.data) ? result.data : []) as Array<{
      deferred_count?: number;
      difficulty_rating: number;
      eligible_count?: number;
      mastered_count?: number;
      matched_tag_ids?: string[];
      needs_retry_count?: number;
      question_code: string;
      question_id: string | null;
      question_type: QuestionType;
      selection_state: "unseen" | "needs_retry" | null;
      title: string;
      ungraded_count?: number;
      unseen_count?: number;
    }>;
    const inventoryRow = rawRows[0];
    const inventory: PracticeInventory = inventoryRow
      ? {
          deferred: Number(inventoryRow.deferred_count ?? 0),
          eligible: Number(inventoryRow.eligible_count ?? 0),
          mastered: Number(inventoryRow.mastered_count ?? 0),
          needsRetry: Number(inventoryRow.needs_retry_count ?? 0),
          ungraded: Number(inventoryRow.ungraded_count ?? 0),
          unseen: Number(inventoryRow.unseen_count ?? 0),
        }
      : emptyInventory;
    const rows = rawRows.filter(
      (row): row is typeof row & {
        question_id: string;
        selection_state: "unseen" | "needs_retry";
      } => Boolean(row.question_id && row.selection_state),
    );

    const laneVisibleBuffer = Math.max(limit, Math.min(2, visibleCandidateCap));
    laneRows.push(
      rows.slice(0, laneVisibleBuffer).map((row) => ({
        ...row,
        laneId: lane.lane_id,
        matchQuality: quality,
      })),
    );

    laneSummaries.push({
      effective_tags: effectiveTags,
      lane_id: lane.lane_id,
      match_quality: rows.length ? quality : "empty",
      mode,
      inventory,
      requested_tags: requestedTags,
      result_count: rows.length,
    });
  }

  allocateVisibleRowsFairly({ candidateRows, laneRows, seenQuestionIds, visibleCandidateCap });

  const orderedIds = candidateRows.map((row) => row.question_id);
  const order = new Map(orderedIds.map((id, index) => [id, index]));

  if (!orderedIds.length) {
    const inventory = laneSummaries.reduce(
      (current, lane) => ({
        deferred: Math.max(current.deferred, lane.inventory.deferred),
        eligible: Math.max(current.eligible, lane.inventory.eligible),
        mastered: Math.max(current.mastered, lane.inventory.mastered),
        needsRetry: Math.max(current.needsRetry, lane.inventory.needsRetry),
        ungraded: Math.max(current.ungraded, lane.inventory.ungraded),
        unseen: Math.max(current.unseen, lane.inventory.unseen),
      }),
      emptyInventory,
    );
    return { candidates: [], inventory, laneSummaries, shortCandidates: [] };
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, question_code, title, content_html, difficulty_rating, options, question_type, source")
    .in("id", orderedIds);

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const rowByQuestionId = new Map(candidateRows.map((row) => [row.question_id, row]));
  const tagsByQuestionId = new Map(candidateRows.map((row) => [row.question_id, row.matched_tag_ids ?? []]));
  const candidates = ((questions ?? []) as Pick<
    Question,
    | "id"
    | "question_code"
    | "title"
    | "content_html"
    | "difficulty_rating"
    | "options"
    | "question_type"
    | "source"
  >[])
    .sort(
      (left, right) =>
        (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((question) => {
      const row = rowByQuestionId.get(question.id);
      return questionToCandidate(
        question,
        tagsByQuestionId.get(question.id) ?? [],
        row?.selection_state,
      );
    });

  const inventory = laneSummaries.reduce(
    (current, lane) => ({
      deferred: Math.max(current.deferred, lane.inventory.deferred),
      eligible: Math.max(current.eligible, lane.inventory.eligible),
      mastered: Math.max(current.mastered, lane.inventory.mastered),
      needsRetry: Math.max(current.needsRetry, lane.inventory.needsRetry),
      ungraded: Math.max(current.ungraded, lane.inventory.ungraded),
      unseen: Math.max(current.unseen, lane.inventory.unseen),
    }),
    emptyInventory,
  );

  return {
    candidates,
    inventory,
    laneSummaries,
    shortCandidates: candidates.map((candidate) => {
      const row = rowByQuestionId.get(candidate.id);
      return {
        difficulty: candidate.difficulty,
        id: candidate.id,
        match_quality: row?.matchQuality ?? (mode === "strict" ? "strict" : "relaxed"),
        match_source: row?.laneId ?? "unknown",
        question_code: candidate.questionCode,
        question_type: candidate.questionType,
        selection_state: candidate.selectionState ?? "unseen",
        tag_ids: shortTagIds(candidate.tagIds).slice(0, 8),
        title_excerpt: candidate.title.slice(0, 160),
      };
    }),
  };
}

export async function loadQuestionForHint({
  questionId,
  supabase,
}: {
  questionId: string;
  supabase: SupabaseLike;
}) {
  const { data, error } = await supabase
    .from("questions")
    .select("id, question_code, title, content_html, difficulty_rating, options, question_type, source")
    .eq("id", questionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Question not found.");
  }

  return questionToCandidate(data as Question, []);
}

export async function loadQuestionsForReview({
  questionIds,
  supabase,
}: {
  questionIds: string[];
  supabase: SupabaseLike;
}) {
  if (!questionIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("questions")
    .select("id, question_code, title, content_html, difficulty_rating, options, question_type, answer_spec, solution_html")
    .in("id", questionIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Pick<
    Question,
    | "id"
    | "question_code"
    | "title"
    | "content_html"
    | "difficulty_rating"
    | "options"
    | "question_type"
    | "answer_spec"
    | "solution_html"
  >[];
}
