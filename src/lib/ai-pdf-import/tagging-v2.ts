import crypto from "node:crypto";

import type { TaxonomyCatalogView } from "@/components/tags/taxonomy-tag-tree-picker";

export type AITaggingV2PlanVersion = "tagging_v2_plan_v1";

export type AITaggingV2PlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export type AITagTaxonomyVersion = "edu_taxonomy_v1";

export type AITagLevel =
  | "subject"
  | "course"
  | "domain"
  | "unit"
  | "skill"
  | "subskill"
  | "format"
  | "difficulty"
  | "cognitive_process"
  | "error_type";

export type AITagSource =
  | "controlled_taxonomy"
  | "local_rule"
  | "packet_hint"
  | "preanalysis_hint"
  | "teacher_edited"
  | "future_ai_ranked";

export type AITagSuggestionStatus =
  | "suggested"
  | "review_required"
  | "rejected_by_validator"
  | "skipped";

export interface AITaggingV2Plan {
  generatedAt: string;
  mode: "planning_only";
  sourceKind: "pdf" | "single_image";
  stats: AITaggingV2PlanStats;
  status: AITaggingV2PlanStatus;
  targets: AITaggingTarget[];
  taxonomyVersion: AITagTaxonomyVersion;
  version: AITaggingV2PlanVersion;
  warnings: string[];
}

export interface AITaggingTarget {
  batchIds: string[];
  packetHash?: string | null;
  packetId?: string | null;
  providerRequestIds: string[];
  sourcePages: number[];
  suggestions: AITagSuggestion[];
  targetHash: string;
  targetId: string;
  textPreview?: string | null;
  validation: AITaggingTargetValidation;
  warnings: string[];
}

export interface AITagSuggestion {
  confidence: number;
  evidence: AITagEvidence[];
  label: string;
  level: AITagLevel;
  parentTagIds: string[];
  reasonCodes: string[];
  reviewRequired: boolean;
  source: AITagSource;
  status: AITagSuggestionStatus;
  tagId: string;
}

export interface AITagEvidence {
  kind:
    | "text_snippet"
    | "marker_hint"
    | "packet_kind"
    | "page_classification"
    | "asset_hint"
    | "format_hint";
  message: string;
  packetIds: string[];
  pageNumbers: number[];
  snippet?: string | null;
}

export interface AITaggingTargetValidation {
  errors: string[];
  genericOnly: boolean;
  hasEvidence: boolean;
  hasSkillLevelTag: boolean;
  valid: boolean;
  warnings: string[];
}

export interface AITaggingV2PlanStats {
  genericOnlyCount: number;
  rejectedSuggestionCount: number;
  reviewRequiredCount: number;
  suggestionCount: number;
  targetCount: number;
  targetsWithSkillTagCount: number;
  targetsWithoutSkillTagCount: number;
}

export interface AITaxonomyTag {
  id: string;
  label: string;
  level: AITagLevel;
  parentIds: string[];
}

type TaggingTargetInput = {
  assetRefCount: number;
  batchIds: string[];
  choiceMarkerCount: number;
  pageClassHints: string[];
  packetHash?: string | null;
  packetId?: string | null;
  packetKind: string;
  providerRequestIds: string[];
  sourceKind: "pdf" | "single_image";
  sourcePages: number[];
  targetId: string;
  textPreview: string;
};

type RawSuggestionInput = {
  confidence: number;
  evidence: AITagEvidence[];
  reasonCodes: string[];
  source: AITagSource;
  tagId: string;
};

const TEXT_PREVIEW_MAX_LENGTH = 700;
const EVIDENCE_SNIPPET_MAX_LENGTH = 180;
const MAX_TARGETS = 80;
const MAX_SUGGESTIONS_PER_TARGET = 8;
const MAX_SKILL_TAGS_PER_TARGET = 3;
const MAX_SUBSKILL_TAGS_PER_TARGET = 3;
const MAX_FORMAT_TAGS_PER_TARGET = 2;
const MAX_DIFFICULTY_TAGS_PER_TARGET = 1;

const DEFAULT_TAXONOMY: AITaxonomyTag[] = [];
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function booleanValue(value: unknown) {
  return value === true;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueNumbers(values: number[]) {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value >= 1)),
  ).sort((left, right) => left - right);
}

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function boundedText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();

  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function inferTagLevel(tagId: string, parentIds: string[], facetKey: string | null): AITagLevel {
  if (tagId === "math" || !parentIds.length) return "subject";
  if (parentIds.includes("math")) {
    if (facetKey === "curriculum") return "course";
    if (facetKey === "concept") return "domain";
    if (facetKey === "form" || facetKey === "task") return "format";
    return "skill";
  }

  if (facetKey === "form" || facetKey === "task") return "format";
  if (facetKey === "curriculum") return "course";
  if (facetKey === "concept") {
    const depth = tagId.split(".").length;
    if (depth <= 3) return "domain";
    if (depth === 4) return "unit";
  }

  return "skill";
}

function taxonomyById(taxonomy: AITaxonomyTag[] = DEFAULT_TAXONOMY) {
  return new Map(taxonomy.map((tag) => [tag.id, tag]));
}

export function taxonomyCatalogToAITagTaxonomy(
  catalog: TaxonomyCatalogView,
): AITaxonomyTag[] {
  const parentTagIds = new Set(
    catalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );

  return catalog.nodes
    .filter(
      (node) =>
        node.facet_key && node.is_assignable && !parentTagIds.has(node.tag_id),
    )
    .map((node) => {
      const parentIds = node.parent_tag_ids ?? [];
      return {
        id: node.tag_id,
        label: node.label,
        level: inferTagLevel(node.tag_id, parentIds, node.facet_key ?? null),
        parentIds,
      };
    });
}

export function getControlledAITagTaxonomy(
  taxonomy: AITaxonomyTag[] = DEFAULT_TAXONOMY,
) {
  return taxonomy;
}

export function findTaxonomyTagById(
  tagId: string,
  taxonomy: AITaxonomyTag[] = DEFAULT_TAXONOMY,
) {
  return taxonomyById(taxonomy).get(tagId) ?? null;
}

function evidenceForTarget({
  kind,
  message,
  snippet,
  target,
}: {
  kind: AITagEvidence["kind"];
  message: string;
  snippet?: string;
  target: TaggingTargetInput;
}): AITagEvidence {
  return {
    kind,
    message,
    packetIds: target.packetId ? [target.packetId] : [],
    pageNumbers: target.sourcePages,
    snippet: snippet ? boundedText(snippet, EVIDENCE_SNIPPET_MAX_LENGTH) : null,
  };
}

function rawSuggestion({
  confidence,
  evidence,
  reasonCodes,
  source = "local_rule",
  tagId,
}: RawSuggestionInput): RawSuggestionInput {
  return { confidence, evidence, reasonCodes, source, tagId };
}

export function validateTagSuggestionAgainstTaxonomy(
  suggestion: RawSuggestionInput | AITagSuggestion,
  taxonomy: AITaxonomyTag[] = DEFAULT_TAXONOMY,
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const taxonomyTag = findTaxonomyTagById(suggestion.tagId, taxonomy);

  if (!taxonomyTag) {
    errors.push("unknown_taxonomy_tag");
  }

  if (!Number.isFinite(suggestion.confidence) || suggestion.confidence < 0 || suggestion.confidence > 1) {
    errors.push("confidence_out_of_range");
  }

  if (!suggestion.evidence.length) {
    errors.push("missing_evidence");
  }

  if (
    "label" in suggestion &&
    taxonomyTag &&
    suggestion.label &&
    suggestion.label !== taxonomyTag.label
  ) {
    errors.push("unsupported_freeform_label");
  }

  const parentTagIds =
    "parentTagIds" in suggestion ? suggestion.parentTagIds : taxonomyTag?.parentIds ?? [];

  if (
    taxonomyTag &&
    parentTagIds.length > 0 &&
    !parentTagIds.every((parentId) => taxonomyTag.parentIds.includes(parentId))
  ) {
    errors.push("parent_child_mismatch");
  }

  if (taxonomyTag && taxonomyTag.parentIds.length > 0 && parentTagIds.length === 0) {
    warnings.push("parent_tag_context_missing");
  }

  return {
    errors,
    tag: taxonomyTag,
    valid: errors.length === 0,
    warnings,
  };
}

export function normalizeTagSuggestion(
  suggestion: RawSuggestionInput,
  taxonomy: AITaxonomyTag[] = DEFAULT_TAXONOMY,
): AITagSuggestion {
  const validation = validateTagSuggestionAgainstTaxonomy(suggestion, taxonomy);
  const tag = validation.tag;
  const reviewRequired =
    !validation.valid ||
    suggestion.confidence < 0.7 ||
    validation.warnings.length > 0;

  return {
    confidence: clampConfidence(suggestion.confidence),
    evidence: suggestion.evidence,
    label: tag?.label ?? suggestion.tagId,
    level: tag?.level ?? "skill",
    parentTagIds: tag?.parentIds ?? [],
    reasonCodes: uniqueStrings([
      ...suggestion.reasonCodes,
      ...validation.errors,
      ...validation.warnings,
    ]),
    reviewRequired,
    source: suggestion.source,
    status: validation.valid
      ? reviewRequired
        ? "review_required"
        : "suggested"
      : "rejected_by_validator",
    tagId: suggestion.tagId,
  };
}

function packetRefsByPacketId(aiPdfImport: Record<string, unknown>) {
  const byPacketId = new Map<string, { batchIds: string[]; providerRequestIds: string[] }>();

  for (const batch of asArray(asRecord(aiPdfImport.extractionBatchPlan).batches)) {
    const batchRecord = asRecord(batch);
    const batchId = stringValue(batchRecord.batchId);

    for (const ref of asArray(batchRecord.packetRefs)) {
      const packetId = stringValue(asRecord(ref).packetId);

      if (!packetId) {
        continue;
      }

      const existing = byPacketId.get(packetId) ?? {
        batchIds: [],
        providerRequestIds: [],
      };
      existing.batchIds = uniqueStrings([...existing.batchIds, batchId]);
      byPacketId.set(packetId, existing);
    }
  }

  for (const request of asArray(asRecord(aiPdfImport.providerRequestPlan).requests)) {
    const requestRecord = asRecord(request);
    const requestId = stringValue(requestRecord.requestId);

    for (const packetId of asArray(requestRecord.packetIds).map(String)) {
      const existing = byPacketId.get(packetId) ?? {
        batchIds: [],
        providerRequestIds: [],
      };
      existing.providerRequestIds = uniqueStrings([
        ...existing.providerRequestIds,
        requestId,
      ]);
      byPacketId.set(packetId, existing);
    }
  }

  return byPacketId;
}

function preanalysisPageHints(aiPdfImport: Record<string, unknown>) {
  const byPage = new Map<
    number,
    {
      choiceMarkerCount: number;
      pageClassHints: string[];
    }
  >();

  for (const page of asArray(asRecord(aiPdfImport.preanalysis).pages)) {
    const pageRecord = asRecord(page);
    const pageNumber = numberValue(pageRecord.pageNumber, 0);

    if (!pageNumber) {
      continue;
    }

    byPage.set(pageNumber, {
      choiceMarkerCount: asArray(pageRecord.choiceMarkerHints).length,
      pageClassHints: [stringValue(pageRecord.pageClass)].filter(Boolean),
    });
  }

  return byPage;
}

function sourceKindFromSummary(aiPdfImport: Record<string, unknown>) {
  const sourceKind =
    stringValue(asRecord(aiPdfImport.preanalysis).sourceKind) ||
    stringValue(asRecord(aiPdfImport.packetPlan).sourceKind) ||
    stringValue(asRecord(aiPdfImport.taggingV2Plan).sourceKind);

  return sourceKind === "single_image" ? "single_image" : "pdf";
}

export function buildTaggingTargetFromPacket({
  aiPdfImport,
  packet,
}: {
  aiPdfImport: Record<string, unknown>;
  packet: Record<string, unknown>;
}): TaggingTargetInput {
  const packetId = stringValue(packet.packetId);
  const packetHash = stringValue(packet.packetHash);
  const pageNumbers = uniqueNumbers(asArray(packet.pageNumbers).map(Number));
  const refs = packetRefsByPacketId(aiPdfImport).get(packetId);
  const pageHints = preanalysisPageHints(aiPdfImport);
  const hintsForPages = pageNumbers.map((pageNumber) => pageHints.get(pageNumber));

  return {
    assetRefCount: asArray(packet.assetRefs).length,
    batchIds: refs?.batchIds ?? [],
    choiceMarkerCount: hintsForPages.reduce(
      (sum, hint) => sum + (hint?.choiceMarkerCount ?? 0),
      0,
    ),
    pageClassHints: uniqueStrings(
      hintsForPages.flatMap((hint) => hint?.pageClassHints ?? []),
    ),
    packetHash,
    packetId,
    packetKind: stringValue(packet.kind),
    providerRequestIds: refs?.providerRequestIds ?? [],
    sourceKind: sourceKindFromSummary(aiPdfImport),
    sourcePages: pageNumbers,
    targetId: packetId || `page-target-${pageNumbers.join("-") || "unknown"}`,
    textPreview: boundedText(stringValue(packet.textPreview), TEXT_PREVIEW_MAX_LENGTH),
  };
}

function addSuggestion(
  suggestions: RawSuggestionInput[],
  target: TaggingTargetInput,
  tagId: string,
  reasonCodes: string[],
  message: string,
  options: {
    confidence?: number;
    evidenceKind?: AITagEvidence["kind"];
    source?: AITagSource;
    snippet?: string;
  } = {},
) {
  suggestions.push(
    rawSuggestion({
      confidence: options.confidence ?? 0.72,
      evidence: [
        evidenceForTarget({
          kind: options.evidenceKind ?? "text_snippet",
          message,
          snippet: options.snippet ?? target.textPreview,
          target,
        }),
      ],
      reasonCodes,
      source: options.source ?? "local_rule",
      tagId,
    }),
  );
}

export function buildRuleBasedTagSuggestionsForTarget(
  target: TaggingTargetInput,
) {
  const suggestions: RawSuggestionInput[] = [];
  const text = target.textPreview.toLowerCase();
  const has = (pattern: RegExp) => pattern.test(text);
  const mathSignal = has(
    /x\^2|quadratic|parabola|slope|intercept|function|equation|circle|radius|probability|median|mean|percent|ratio|triangle|graph|table/,
  );

  if (mathSignal) {
    addSuggestion(suggestions, target, "math", ["math_signal"], "Math signal found.", {
      confidence: 0.8,
    });
    addSuggestion(suggestions, target, "math.curriculum.sat", ["sat_math_style"], "SAT/AP-style math signal found.", {
      confidence: 0.68,
    });
  }

  if (has(/quadratic|parabola|x\^2|x²|vertex|factor/)) {
    addSuggestion(suggestions, target, "math.concept.functions", ["quadratic_signal"], "Quadratic or parabola language found.");
    addSuggestion(suggestions, target, "math.concept.functions.quadratic", ["quadratic_signal"], "Quadratic unit signal found.");
    addSuggestion(suggestions, target, "math.method.algebraic_manipulation.factor", ["quadratic_factor_signal"], "Quadratic factoring signal found.");
  }

  if (has(/difference of squares|x\^2\s*-\s*y\^2|a\^2\s*-\s*b\^2/)) {
    addSuggestion(suggestions, target, "math.concept.algebra.expressions.polynomial_expressions", ["difference_of_squares_signal"], "Difference of squares pattern found.");
  }

  if (has(/vertex|vertex form/)) {
    addSuggestion(suggestions, target, "math.concept.functions.quadratic.vertex_form", ["vertex_form_signal"], "Vertex form language found.");
  }

  if (has(/slope|intercept|linear function|rate of change|y-intercept|y intercept/)) {
    addSuggestion(suggestions, target, "math.concept.algebra", ["linear_signal"], "Linear function signal found.");
    addSuggestion(suggestions, target, "math.concept.functions", ["linear_function_signal"], "Function unit signal found.");
    addSuggestion(suggestions, target, "math.concept.functions.linear", ["linear_function_signal"], "Linear function interpretation signal found.");
    addSuggestion(suggestions, target, "math.concept.functions.linear.slope_intercept_form", ["slope_intercept_signal"], "Slope/intercept signal found.");
  }

  if (has(/two points|points \(|slope from/)) {
    addSuggestion(suggestions, target, "math.concept.functions.linear.slope", ["slope_from_points_signal"], "Slope from two points signal found.");
  }

  if (has(/system|intersection|two equations|simultaneous/)) {
    addSuggestion(suggestions, target, "math.concept.algebra.equations.systems_linear", ["systems_signal"], "Systems of equations signal found.");
    addSuggestion(suggestions, target, "math.method.equation_solving.system_elimination", ["systems_solution_signal"], "Systems solution signal found.");
  }

  if (has(/circle|radius|center|\(x\s*[-+]\s*h\)\^2|\(y\s*[-+]\s*k\)\^2/)) {
    addSuggestion(suggestions, target, "math.concept.geometry", ["circle_signal"], "Geometry/circle signal found.");
    addSuggestion(suggestions, target, "math.concept.geometry.circles", ["circle_signal"], "Circle unit signal found.");
    addSuggestion(suggestions, target, "math.concept.geometry.circles", ["circle_equation_signal"], "Circle equation signal found.");
  }

  if (has(/mean|median|standard deviation/)) {
    addSuggestion(suggestions, target, "math.concept.statistics_probability.center_spread", ["statistics_signal"], "Statistics signal found.");
    addSuggestion(suggestions, target, has(/standard deviation/) ? "math.concept.statistics_probability.center_spread" : "math.concept.statistics_probability.center_spread", ["statistics_skill_signal"], "Statistics skill signal found.");
  }

  if (has(/probability|given that|two-way|two way|conditional|table/)) {
    addSuggestion(suggestions, target, "math.concept.statistics_probability.probability_basics", ["probability_signal"], "Probability signal found.");
    addSuggestion(suggestions, target, "math.concept.statistics_probability.conditional_probability", ["conditional_probability_signal"], "Conditional probability signal found.");
    if (has(/table|two-way|two way/)) {
      addSuggestion(suggestions, target, "math.concept.statistics_probability.two_way_tables", ["two_way_table_signal"], "Two-way table signal found.");
    }
  }

  if (has(/percent|percentage|%|ratio|proportion/)) {
    addSuggestion(suggestions, target, "math.concept.number_quantity.ratios_rates_proportions", ["ratio_percent_signal"], "Ratio/percent signal found.");
    addSuggestion(suggestions, target, has(/percent|percentage|%/) ? "math.concept.number_quantity.fractions_decimals_percents" : "math.concept.number_quantity.ratios_rates_proportions", ["ratio_percent_skill_signal"], "Ratio/percent skill signal found.");
  }

  if (target.choiceMarkerCount > 0 || has(/\b[a-d]\./)) {
    addSuggestion(suggestions, target, "math.form.symbolic.expression", ["choice_marker_signal"], "Choice markers found.", {
      evidenceKind: "marker_hint",
      source: "preanalysis_hint",
    });
  }

  if (has(/free response|explain|justify|show your work/)) {
    addSuggestion(suggestions, target, "math.form.verbal.word_problem", ["free_response_signal"], "Free-response language found.", {
      evidenceKind: "format_hint",
    });
  }

  if (has(/graph|coordinate plane/)) {
    addSuggestion(suggestions, target, "math.form.visual.coordinate_graph", ["graph_signal"], "Graph signal found.");
  }

  if (has(/table|two-way|two way/)) {
    addSuggestion(suggestions, target, "math.form.table.data_table", ["table_signal"], "Table signal found.");
  }

  if (target.assetRefCount > 0 || target.packetKind.includes("asset")) {
    addSuggestion(suggestions, target, "math.form.visual.diagram", ["asset_ref_signal"], "Asset reference found.", {
      evidenceKind: "asset_hint",
      source: "packet_hint",
    });
    addSuggestion(suggestions, target, "math.form.visual.diagram", ["diagram_ref_signal"], "Diagram/image context found.", {
      evidenceKind: "asset_hint",
      source: "packet_hint",
    });
  }

  if (has(/multi-step|multi step|more than one step|both/)) {
    addSuggestion(suggestions, target, "math.task.explain.explain_reasoning", ["multi_step_signal"], "Multi-step language found.");
  } else if (mathSignal) {
    addSuggestion(suggestions, target, "math.task.model.build_model", ["application_signal"], "Application-style math signal found.", {
      confidence: 0.62,
    });
  }

  if (!suggestions.length) {
    addSuggestion(suggestions, target, "math", ["no_strong_signal"], "No strong taxonomy signal found.", {
      confidence: 0.35,
      evidenceKind: "packet_kind",
      source: "packet_hint",
    });
    addSuggestion(suggestions, target, "math.form", ["no_strong_format_signal"], "No strong format signal found.", {
      confidence: 0.35,
      evidenceKind: "packet_kind",
      source: "packet_hint",
    });
  }

  return suggestions;
}

function capSuggestions(suggestions: AITagSuggestion[], warnings: string[]) {
  const byId = new Map<string, AITagSuggestion>();

  for (const suggestion of suggestions) {
    const existing = byId.get(suggestion.tagId);

    if (!existing || suggestion.confidence > existing.confidence) {
      byId.set(suggestion.tagId, suggestion);
    }
  }

  let deduped = Array.from(byId.values()).sort((left, right) => {
    const levelRank: Record<AITagLevel, number> = {
      skill: 0,
      subskill: 1,
      unit: 2,
      domain: 3,
      format: 4,
      cognitive_process: 5,
      difficulty: 6,
      course: 7,
      subject: 8,
      error_type: 9,
    };

    return (
      (levelRank[left.level] ?? 99) - (levelRank[right.level] ?? 99) ||
      right.confidence - left.confidence
    );
  });

  const keepByLevel = (level: AITagLevel, max: number) => {
    let seen = 0;
    deduped = deduped.filter((suggestion) => {
      if (suggestion.level !== level) {
        return true;
      }
      seen += 1;
      return seen <= max;
    });
  };

  keepByLevel("skill", MAX_SKILL_TAGS_PER_TARGET);
  keepByLevel("subskill", MAX_SUBSKILL_TAGS_PER_TARGET);
  keepByLevel("format", MAX_FORMAT_TAGS_PER_TARGET);
  keepByLevel("difficulty", MAX_DIFFICULTY_TAGS_PER_TARGET);

  if (deduped.length > MAX_SUGGESTIONS_PER_TARGET) {
    warnings.push("tagging_v2_too_many_suggestions_limited");
    deduped = deduped.slice(0, MAX_SUGGESTIONS_PER_TARGET);
  }

  return deduped;
}

export function validateTaggingTarget(
  suggestions: AITagSuggestion[],
): AITaggingTargetValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const accepted = suggestions.filter(
    (suggestion) => suggestion.status !== "rejected_by_validator",
  );
  const hasEvidence = accepted.every((suggestion) => suggestion.evidence.length > 0);
  const hasSkillLevelTag = accepted.some(
    (suggestion) => suggestion.level === "skill" || suggestion.level === "subskill",
  );
  const genericOnly =
    accepted.length > 0 &&
    !hasSkillLevelTag &&
    accepted.every((suggestion) =>
      ["subject", "course", "domain", "format", "difficulty", "cognitive_process"].includes(
        suggestion.level,
      ),
    );
  const difficultyCount = accepted.filter(
    (suggestion) => suggestion.level === "difficulty",
  ).length;

  if (!hasEvidence) {
    errors.push("suggestion_missing_evidence");
  }

  if (genericOnly) {
    warnings.push("tagging_v2_generic_only");
  }

  if (!hasSkillLevelTag) {
    warnings.push("tagging_v2_missing_skill_level_tag");
  }

  if (difficultyCount > 1) {
    errors.push("contradictory_difficulty_tags");
  }

  return {
    errors,
    genericOnly,
    hasEvidence,
    hasSkillLevelTag,
    valid: errors.length === 0,
    warnings,
  };
}

function buildTarget({
  aiPdfImport,
  taxonomy,
  target,
}: {
  aiPdfImport: Record<string, unknown>;
  taxonomy: AITaxonomyTag[];
  target: TaggingTargetInput;
}): AITaggingTarget {
  const warnings: string[] = [];
  const normalizedSuggestions = buildRuleBasedTagSuggestionsForTarget(target).map(
    (suggestion) => normalizeTagSuggestion(suggestion, taxonomy),
  );
  let suggestions = capSuggestions(normalizedSuggestions, warnings);
  const validation = validateTaggingTarget(suggestions);

  if (validation.genericOnly) {
    warnings.push("tagging_v2_generic_only");
    suggestions = suggestions.map((suggestion) => ({
      ...suggestion,
      reviewRequired: true,
      status:
        suggestion.status === "suggested" ? "review_required" : suggestion.status,
    }));
  }

  const rejectedCount = suggestions.filter(
    (suggestion) => suggestion.status === "rejected_by_validator",
  ).length;

  if (rejectedCount > 0) {
    warnings.push("tagging_v2_unknown_taxonomy_tag_rejected");
  }

  const targetHash = stableHash({
    packetHash: target.packetHash,
    packetId: target.packetId,
    sourcePages: target.sourcePages,
    suggestions: suggestions.map((suggestion) => suggestion.tagId),
    textPreview: target.textPreview,
    taxonomyVersion: "edu_taxonomy_v1",
  });

  void aiPdfImport;

  return {
    batchIds: target.batchIds,
    packetHash: target.packetHash ?? null,
    packetId: target.packetId ?? null,
    providerRequestIds: target.providerRequestIds,
    sourcePages: target.sourcePages,
    suggestions,
    targetHash,
    targetId: `tagging-target-${targetHash.slice(0, 12)}`,
    textPreview: target.textPreview || null,
    validation,
    warnings: uniqueStrings([...warnings, ...validation.warnings]),
  };
}

function fallbackTargetsFromPreanalysis(
  aiPdfImport: Record<string, unknown>,
): TaggingTargetInput[] {
  const sourceKind = sourceKindFromSummary(aiPdfImport);

  return asArray(asRecord(aiPdfImport.preanalysis).pages)
    .map((page) => {
      const pageRecord = asRecord(page);
      const pageNumber = numberValue(pageRecord.pageNumber, 0);
      const textPreview = boundedText(
        stringValue(pageRecord.extractedTextPreview),
        TEXT_PREVIEW_MAX_LENGTH,
      );

      if (!pageNumber || !textPreview) {
        return null;
      }

      const target: TaggingTargetInput = {
        assetRefCount: asArray(pageRecord.assetHints).length,
        batchIds: [],
        choiceMarkerCount: asArray(pageRecord.choiceMarkerHints).length,
        pageClassHints: [stringValue(pageRecord.pageClass)].filter(Boolean),
        packetHash: null,
        packetId: null,
        packetKind: "preanalysis_page",
        providerRequestIds: [],
        sourceKind,
        sourcePages: [pageNumber],
        targetId: `page-${pageNumber}`,
        textPreview,
      };

      return target;
    })
    .filter((target): target is TaggingTargetInput => Boolean(target));
}

export function buildAITaggingV2PlanFromSummary(
  aiPdfImport: Record<string, unknown>,
  taxonomy: AITaxonomyTag[] = DEFAULT_TAXONOMY,
): AITaggingV2Plan {
  const warnings = ["tagging_v2_planning_only", "tagging_v2_no_ai_ranking"];
  if (!taxonomy.length) {
    warnings.push("tagging_v2_missing_db_taxonomy");
  }
  const sourceKind = sourceKindFromSummary(aiPdfImport);
  const packetPlan = asRecord(aiPdfImport.packetPlan);
  const packets = asArray(packetPlan.packets).map(asRecord);
  let targetInputs = packets
    .map((packet) => buildTaggingTargetFromPacket({ aiPdfImport, packet }))
    .filter((target) => target.targetId);

  if (!targetInputs.length) {
    warnings.push("tagging_v2_missing_packet_plan");
    targetInputs = fallbackTargetsFromPreanalysis(aiPdfImport);
  }

  if (targetInputs.length > MAX_TARGETS) {
    warnings.push("tagging_v2_summary_limited");
    targetInputs = targetInputs.slice(0, MAX_TARGETS);
  }

  const targets = targetInputs.map((target) =>
    buildTarget({ aiPdfImport, taxonomy, target }),
  );
  const stats = planStats(targets);

  if (stats.genericOnlyCount > 0) {
    warnings.push("tagging_v2_generic_only");
  }

  if (stats.reviewRequiredCount > 0) {
    warnings.push("tagging_v2_review_required");
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: "planning_only",
    sourceKind,
    stats,
    status:
      targets.length === 0
        ? "skipped"
        : warnings.length > 2 || stats.rejectedSuggestionCount > 0
          ? "completed_with_warnings"
          : "completed",
    targets,
    taxonomyVersion: "edu_taxonomy_v1",
    version: "tagging_v2_plan_v1",
    warnings: uniqueStrings(warnings),
  };
}

function planStats(targets: AITaggingTarget[]): AITaggingV2PlanStats {
  return {
    genericOnlyCount: targets.filter((target) => target.validation.genericOnly)
      .length,
    rejectedSuggestionCount: targets.flatMap((target) => target.suggestions).filter(
      (suggestion) => suggestion.status === "rejected_by_validator",
    ).length,
    reviewRequiredCount: targets.filter((target) =>
      target.suggestions.some((suggestion) => suggestion.reviewRequired),
    ).length,
    suggestionCount: targets.reduce(
      (sum, target) => sum + target.suggestions.length,
      0,
    ),
    targetCount: targets.length,
    targetsWithSkillTagCount: targets.filter(
      (target) => target.validation.hasSkillLevelTag,
    ).length,
    targetsWithoutSkillTagCount: targets.filter(
      (target) => !target.validation.hasSkillLevelTag,
    ).length,
  };
}

export function failedAITaggingV2Plan({
  generatedAt = new Date().toISOString(),
  sourceKind = "pdf",
  warnings,
}: {
  generatedAt?: string;
  sourceKind?: "pdf" | "single_image";
  warnings: string[];
}): AITaggingV2Plan {
  return {
    generatedAt,
    mode: "planning_only",
    sourceKind,
    stats: {
      genericOnlyCount: 0,
      rejectedSuggestionCount: 0,
      reviewRequiredCount: 0,
      suggestionCount: 0,
      targetCount: 0,
      targetsWithSkillTagCount: 0,
      targetsWithoutSkillTagCount: 0,
    },
    status: "failed",
    targets: [],
    taxonomyVersion: "edu_taxonomy_v1",
    version: "tagging_v2_plan_v1",
    warnings,
  };
}

export function mergeAITaggingV2PlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  taggingV2Plan: AITaggingV2Plan,
) {
  return {
    ...existingAiPdfImport,
    taggingV2Plan,
  };
}
