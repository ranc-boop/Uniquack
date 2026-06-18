import crypto from "node:crypto";

import type { AITagLevel } from "./tagging-v2";

export type AITaxonomyBootstrapPlanVersion = "taxonomy_bootstrap_plan_v1";

export type AITaxonomyBootstrapPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export type AITaxonomyPackKind =
  | "core"
  | "course"
  | "exam"
  | "teacher_private"
  | "school"
  | "candidate";

export type AITaxonomyDraftStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "rejected"
  | "merged_as_alias"
  | "needs_parent_review";

export type AITaxonomyReviewAction =
  | "approve_as_official"
  | "reject"
  | "merge_as_alias"
  | "rename"
  | "move_parent"
  | "split_tag"
  | "needs_more_evidence"
  | "keep_pending";

export interface AITaxonomyBootstrapPlan {
  aliasCandidates: AITagAliasCandidate[];
  candidateQueue: AITagCandidateQueueItem[];
  draftPacks: AITaxonomyDraftPack[];
  generatedAt: string;
  mode: "planning_only";
  reviewActions: AITaxonomyReviewActionDraft[];
  sourceKind: "pdf" | "single_image";
  stats: AITaxonomyBootstrapPlanStats;
  status: AITaxonomyBootstrapPlanStatus;
  taxonomyVersion: "edu_taxonomy_v1";
  version: AITaxonomyBootstrapPlanVersion;
  warnings: string[];
}

export interface AITaxonomyDraftPack {
  description: string;
  kind: AITaxonomyPackKind;
  label: string;
  packHash: string;
  packId: string;
  source:
    | "built_in_seed"
    | "tagging_v2_gap"
    | "teacher_private"
    | "future_ai_bootstrap";
  status: "draft" | "pending_review";
  tagDrafts: AITaxonomyDraftTag[];
  warnings: string[];
}

export interface AITaxonomyDraftTag {
  aliases: string[];
  commonErrorTypeTagIds: string[];
  confidence: number;
  description: string;
  draftTagId: string;
  evidence: AITaxonomyEvidence[];
  exampleSignals: string[];
  label: string;
  level: AITagLevel;
  parentTagIds: string[];
  prerequisiteTagIds: string[];
  proposedOfficialId: string;
  relatedTagIds: string[];
  status: AITaxonomyDraftStatus;
  validation: AITaxonomyDraftTagValidation;
  warnings: string[];
}

export interface AITagCandidateQueueItem {
  candidateHash: string;
  candidateId: string;
  confidence: number;
  evidence: AITaxonomyEvidence[];
  nearestExistingTags: AINearestExistingTagRef[];
  proposedAliases: string[];
  proposedLabel: string;
  proposedLevel: AITagLevel;
  proposedParentTagIds: string[];
  recommendedReviewAction: AITaxonomyReviewAction;
  source:
    | "tagging_v2_generic_only"
    | "tagging_v2_rejected_freeform"
    | "missing_skill_gap"
    | "teacher_proposed"
    | "future_ai_proposed";
  sourceRefs: {
    packetHashes: string[];
    packetIds: string[];
    pageNumbers: number[];
    targetIds: string[];
  };
  status: "pending_review";
  warnings: string[];
}

export interface AITagAliasCandidate {
  aliasCandidateHash: string;
  aliasCandidateId: string;
  aliasText: string;
  confidence: number;
  evidence: AITaxonomyEvidence[];
  sourceCandidateIds: string[];
  status: "pending_review";
  targetLabel: string;
  targetTagId: string;
  warnings: string[];
}

export interface AINearestExistingTagRef {
  label: string;
  level: AITagLevel;
  reason: string;
  similarity: number;
  tagId: string;
}

export interface AITaxonomyReviewActionDraft {
  confidence: number;
  humanRequired: true;
  reason: string;
  recommendedAction: AITaxonomyReviewAction;
  reviewActionId: string;
  targetId: string;
  targetType: "draft_tag" | "candidate_tag" | "alias_candidate";
}

export interface AITaxonomyEvidence {
  kind:
    | "tagging_v2_suggestion"
    | "text_signal"
    | "alias_signal"
    | "packet_hint"
    | "format_hint"
    | "generic_gap"
    | "validator_rejection";
  message: string;
  packetIds: string[];
  pageNumbers: number[];
  snippet?: string | null;
}

export interface AITaxonomyDraftTagValidation {
  duplicateLikely: boolean;
  errors: string[];
  genericTooBroad: boolean;
  hasEvidence: boolean;
  idShapeValid: boolean;
  levelValid: boolean;
  parentKnownOrPending: boolean;
  valid: boolean;
  warnings: string[];
}

export interface AITaxonomyBootstrapPlanStats {
  aliasCandidateCount: number;
  candidateQueueCount: number;
  draftPackCount: number;
  draftTagCount: number;
  duplicateLikelyCount: number;
  needsParentReviewCount: number;
  rejectedOrInvalidCount: number;
  reviewActionCount: number;
}

type DraftSeed = {
  aliases?: string[];
  commonErrorTypeTagIds?: string[];
  description: string;
  exampleSignals: string[];
  label: string;
  level: AITagLevel;
  parentTagIds: string[];
  prerequisiteTagIds?: string[];
  proposedOfficialId: string;
  relatedTagIds?: string[];
};

type CandidateInput = {
  confidence: number;
  evidence: AITaxonomyEvidence[];
  proposedAliases?: string[];
  proposedLabel: string;
  proposedLevel: AITagLevel;
  proposedParentTagIds: string[];
  source: AITagCandidateQueueItem["source"];
  sourceRefs: AITagCandidateQueueItem["sourceRefs"];
  warnings?: string[];
};

const EVIDENCE_SNIPPET_MAX_LENGTH = 180;
const MAX_DRAFT_TAGS_PER_PACK = 32;
const MAX_CANDIDATES = 48;
const MAX_ALIAS_CANDIDATES = 32;
const MAX_ALIASES_PER_TAG = 10;
const ID_SHAPE = /^[a-z][a-z0-9]*(\.[a-z0-9_]+)+$/;
const ROOT_LEVELS = new Set<AITagLevel>([
  "subject",
  "format",
  "difficulty",
  "cognitive_process",
  "error_type",
]);
const LEVELS = new Set<AITagLevel>([
  "subject",
  "course",
  "domain",
  "unit",
  "skill",
  "subskill",
  "format",
  "difficulty",
  "cognitive_process",
  "error_type",
]);
const GENERIC_SKILL_LABELS = new Set([
  "algebra",
  "answer",
  "concept",
  "math",
  "problem",
  "question",
  "review",
  "skill",
]);

const CONTROLLED_TAXONOMY_REFS: Array<{
  id: string;
  label: string;
  level: AITagLevel;
  parentIds: string[];
}> = [
  { id: "subject.math", label: "Math", level: "subject", parentIds: [] },
  { id: "subject.physics", label: "Physics", level: "subject", parentIds: [] },
  { id: "course.sat_math", label: "SAT Math", level: "course", parentIds: ["subject.math"] },
  { id: "course.general_math", label: "General Math", level: "course", parentIds: ["subject.math"] },
  { id: "course.ap_calculus_ab", label: "AP Calculus AB", level: "course", parentIds: ["subject.math"] },
  { id: "course.ap_physics_1", label: "AP Physics 1", level: "course", parentIds: ["subject.physics"] },
  { id: "domain.algebra", label: "Algebra", level: "domain", parentIds: ["course.sat_math", "course.general_math"] },
  { id: "domain.advanced_math", label: "Advanced Math", level: "domain", parentIds: ["course.sat_math", "course.general_math"] },
  { id: "domain.problem_solving_data_analysis", label: "Problem Solving and Data Analysis", level: "domain", parentIds: ["course.sat_math"] },
  { id: "unit.functions", label: "Functions", level: "unit", parentIds: ["domain.advanced_math", "domain.algebra"] },
  { id: "unit.quadratics", label: "Quadratics", level: "unit", parentIds: ["domain.advanced_math"] },
  { id: "unit.ratios_percentages", label: "Ratios and percentages", level: "unit", parentIds: ["domain.problem_solving_data_analysis"] },
  { id: "unit.statistics", label: "Statistics", level: "unit", parentIds: ["domain.problem_solving_data_analysis"] },
  { id: "unit.probability", label: "Probability", level: "unit", parentIds: ["domain.problem_solving_data_analysis"] },
  { id: "unit.triangles", label: "Triangles", level: "unit", parentIds: ["domain.geometry_trigonometry"] },
  { id: "skill.slope_intercept", label: "Slope-intercept interpretation", level: "skill", parentIds: ["unit.functions"] },
  { id: "skill.factor_quadratic", label: "Factor quadratic", level: "skill", parentIds: ["unit.quadratics"] },
  { id: "skill.conditional_probability", label: "Conditional probability", level: "skill", parentIds: ["unit.probability"] },
  { id: "skill.percent_change", label: "Percent change", level: "skill", parentIds: ["unit.ratios_percentages"] },
  { id: "skill.mean_median", label: "Mean and median", level: "skill", parentIds: ["unit.statistics"] },
  { id: "skill.polynomial_operations", label: "Polynomial operations", level: "skill", parentIds: ["unit.polynomials"] },
  { id: "skill.ratio_proportion", label: "Ratio and proportion", level: "skill", parentIds: ["unit.ratios_percentages"] },
  { id: "skill.similar_triangles", label: "Similar triangles", level: "skill", parentIds: ["unit.triangles"] },
  { id: "subskill.vertex_form", label: "Vertex form", level: "subskill", parentIds: ["skill.quadratic_formula", "skill.complete_square"] },
  { id: "subskill.table_to_function", label: "Table to function", level: "subskill", parentIds: ["skill.function_notation"] },
  { id: "format.numeric_input", label: "Numeric input", level: "format", parentIds: [] },
  { id: "error.unit_error", label: "Unit error", level: "error_type", parentIds: [] },
  { id: "error.algebra_manipulation_error", label: "Algebra manipulation error", level: "error_type", parentIds: [] },
];

function getControlledTaxonomyRefs() {
  return CONTROLLED_TAXONOMY_REFS;
}

function findControlledTaxonomyRef(tagId: string) {
  return CONTROLLED_TAXONOMY_REFS.find((tag) => tag.id === tagId) ?? null;
}

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

function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueNumbers(values: number[]) {
  return Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value >= 1)),
  ).sort((left, right) => left - right);
}

function boundedText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();

  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value: string) {
  return normalizeText(value).replace(/\s+/g, "_") || "unknown";
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sourceKindFromSummary(aiPdfImport: Record<string, unknown>) {
  const sourceKind =
    stringValue(asRecord(aiPdfImport.taggingV2Plan).sourceKind) ||
    stringValue(asRecord(aiPdfImport.preanalysis).sourceKind) ||
    stringValue(asRecord(aiPdfImport.packetPlan).sourceKind);

  return sourceKind === "single_image" ? "single_image" : "pdf";
}

function evidence({
  kind,
  message,
  packetIds = [],
  pageNumbers = [],
  snippet,
}: {
  kind: AITaxonomyEvidence["kind"];
  message: string;
  packetIds?: string[];
  pageNumbers?: number[];
  snippet?: string | null;
}): AITaxonomyEvidence {
  return {
    kind,
    message,
    packetIds: uniqueStrings(packetIds),
    pageNumbers: uniqueNumbers(pageNumbers),
    snippet: snippet ? boundedText(snippet, EVIDENCE_SNIPPET_MAX_LENGTH) : null,
  };
}

function existingTaxonomyRefs() {
  return getControlledTaxonomyRefs().map((tag) => ({
    id: tag.id,
    label: tag.label,
    level: tag.level,
    parentIds: tag.parentIds,
  }));
}

function tokenSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeText(left).split(" ").filter(Boolean));
  const rightTokens = new Set(normalizeText(right).split(" ").filter(Boolean));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  const intersection = Array.from(leftTokens).filter((token) =>
    rightTokens.has(token),
  ).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;

  return intersection / union;
}

function validateLevel(value: string): AITagLevel {
  return LEVELS.has(value as AITagLevel) ? (value as AITagLevel) : "skill";
}

export function validateTaxonomyDraftTag({
  draftTag,
  knownDraftIds,
}: {
  draftTag: Pick<
    AITaxonomyDraftTag,
    | "aliases"
    | "evidence"
    | "label"
    | "level"
    | "parentTagIds"
    | "proposedOfficialId"
  >;
  knownDraftIds: string[];
}): AITaxonomyDraftTagValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const normalizedLabel = normalizeText(draftTag.label);
  const idShapeValid = ID_SHAPE.test(draftTag.proposedOfficialId);
  const levelValid = LEVELS.has(draftTag.level);
  const parentRequired = !ROOT_LEVELS.has(draftTag.level);
  const knownParentIds = new Set([
    ...getControlledTaxonomyRefs().map((tag) => tag.id),
    ...knownDraftIds,
  ]);
  const parentKnownOrPending =
    !parentRequired ||
    (draftTag.parentTagIds.length > 0 &&
      draftTag.parentTagIds.every((parentId) => knownParentIds.has(parentId)));
  const hasEvidence = draftTag.evidence.length > 0;
  const duplicateLikely = getControlledTaxonomyRefs().some(
    (tag) =>
      tag.id === draftTag.proposedOfficialId ||
      normalizeText(tag.label) === normalizedLabel ||
      tokenSimilarity(tag.label, draftTag.label) >= 0.82,
  );
  const genericTooBroad =
    (draftTag.level === "skill" || draftTag.level === "subskill") &&
    GENERIC_SKILL_LABELS.has(normalizedLabel);

  if (!idShapeValid) {
    errors.push("invalid_id_shape");
  }

  if (!levelValid) {
    errors.push("unknown_level");
  }

  if (parentRequired && draftTag.parentTagIds.length === 0) {
    errors.push("missing_parent");
  }

  if (!parentKnownOrPending) {
    errors.push("unknown_or_pending_parent_missing");
  }

  if (!hasEvidence) {
    errors.push("missing_evidence");
  }

  if (duplicateLikely) {
    warnings.push("likely_duplicate_existing_tag");
  }

  if (genericTooBroad) {
    errors.push("generic_too_broad");
  }

  if (draftTag.aliases.length > MAX_ALIASES_PER_TAG) {
    warnings.push("too_many_aliases_limited");
  }

  if (draftTag.proposedOfficialId.startsWith("freeform.")) {
    errors.push("unsupported_freeform_official_tag");
  }

  return {
    duplicateLikely,
    errors,
    genericTooBroad,
    hasEvidence,
    idShapeValid,
    levelValid,
    parentKnownOrPending,
    valid: errors.length === 0,
    warnings,
  };
}

function draftTagFromSeed({
  packId,
  seed,
}: {
  packId: string;
  seed: DraftSeed;
}): AITaxonomyDraftTag {
  const draftTagId = `draft-${packId}-${slug(seed.proposedOfficialId)}`;
  const evidenceItems = seed.exampleSignals.map((signal) =>
    evidence({
      kind: "text_signal",
      message: "Built-in starter taxonomy signal.",
      snippet: signal,
    }),
  );
  const draftTagBase = {
    aliases: uniqueStrings(seed.aliases ?? []).slice(0, MAX_ALIASES_PER_TAG),
    commonErrorTypeTagIds: uniqueStrings(seed.commonErrorTypeTagIds ?? []),
    confidence: 0.72,
    description: seed.description,
    draftTagId,
    evidence: evidenceItems,
    exampleSignals: uniqueStrings(seed.exampleSignals),
    label: seed.label,
    level: seed.level,
    parentTagIds: uniqueStrings(seed.parentTagIds),
    prerequisiteTagIds: uniqueStrings(seed.prerequisiteTagIds ?? []),
    proposedOfficialId: seed.proposedOfficialId,
    relatedTagIds: uniqueStrings(seed.relatedTagIds ?? []),
  };
  const validation = validateTaxonomyDraftTag({
    draftTag: draftTagBase,
    knownDraftIds: [],
  });
  const status: AITaxonomyDraftStatus = validation.valid
    ? validation.duplicateLikely
      ? "pending_review"
      : "draft"
    : validation.errors.includes("missing_parent") ||
        validation.errors.includes("unknown_or_pending_parent_missing")
      ? "needs_parent_review"
      : "rejected";

  return {
    ...draftTagBase,
    status,
    validation,
    warnings: uniqueStrings(validation.warnings),
  };
}

function buildDraftPack({
  description,
  kind,
  label,
  packId,
  seeds,
}: {
  description: string;
  kind: AITaxonomyPackKind;
  label: string;
  packId: string;
  seeds: DraftSeed[];
}): AITaxonomyDraftPack {
  const tagDrafts = seeds
    .slice(0, MAX_DRAFT_TAGS_PER_PACK)
    .map((seed) => draftTagFromSeed({ packId, seed }));
  const knownDraftIds = tagDrafts.map((tag) => tag.proposedOfficialId);
  const revalidatedDrafts = tagDrafts.map((tag) => {
    const validation = validateTaxonomyDraftTag({
      draftTag: tag,
      knownDraftIds,
    });
    const status: AITaxonomyDraftStatus = validation.valid
      ? validation.duplicateLikely
        ? "pending_review"
        : "draft"
      : validation.errors.includes("missing_parent") ||
          validation.errors.includes("unknown_or_pending_parent_missing")
        ? "needs_parent_review"
        : "rejected";

    return {
      ...tag,
      status,
      validation,
      warnings: uniqueStrings([...tag.warnings, ...validation.warnings]),
    };
  });
  const warnings = uniqueStrings(
    revalidatedDrafts.flatMap((tag) => tag.validation.warnings),
  );

  return {
    description,
    kind,
    label,
    packHash: stableHash({
      packId,
      tagDraftIds: revalidatedDrafts.map((tag) => tag.proposedOfficialId),
    }),
    packId,
    source: "built_in_seed",
    status: warnings.length ? "pending_review" : "draft",
    tagDrafts: revalidatedDrafts,
    warnings,
  };
}

export function buildStarterTaxonomyDraftPacks(): AITaxonomyDraftPack[] {
  return [
    buildDraftPack({
      description: "SAT Math starter expansion for algebra, functions, data, and geometry.",
      kind: "exam",
      label: "SAT Math v1 draft",
      packId: "sat_math_v1_draft",
      seeds: [
        {
          aliases: ["constant rate", "linear rate", "rate of change"],
          description: "Interpret slope as a constant rate of change in context.",
          exampleSignals: ["slope", "rate of change", "constant rate"],
          label: "Linear rate of change",
          level: "skill",
          parentTagIds: ["unit.functions"],
          proposedOfficialId: "skill.linear_rate_of_change",
          relatedTagIds: ["skill.slope_intercept"],
        },
        {
          aliases: ["zeros", "roots", "x-intercepts"],
          description: "Use factored quadratics to interpret roots or x-intercepts.",
          exampleSignals: ["roots", "x-intercepts", "factored form"],
          label: "Quadratic roots in context",
          level: "skill",
          parentTagIds: ["unit.quadratics"],
          proposedOfficialId: "skill.quadratic_roots_context",
          relatedTagIds: ["skill.factor_quadratic"],
        },
        {
          aliases: ["vertex", "maximum", "minimum"],
          description: "Interpret the vertex of a quadratic function in context.",
          exampleSignals: ["vertex", "maximum height", "minimum value"],
          label: "Quadratic vertex interpretation",
          level: "skill",
          parentTagIds: ["unit.quadratics"],
          proposedOfficialId: "skill.quadratic_vertex_interpretation",
          relatedTagIds: ["subskill.vertex_form"],
        },
        {
          aliases: ["function table", "input output table"],
          description: "Infer or evaluate a function from a table of values.",
          exampleSignals: ["input-output table", "values of f(x)", "table"],
          label: "Function table interpretation",
          level: "skill",
          parentTagIds: ["unit.functions"],
          proposedOfficialId: "skill.function_table_interpretation",
          relatedTagIds: ["subskill.table_to_function"],
        },
        {
          aliases: ["rational expression", "asymptote"],
          description: "Interpret rational functions and asymptotic behavior.",
          exampleSignals: ["asymptote", "rational function", "denominator zero"],
          label: "Rational function behavior",
          level: "skill",
          parentTagIds: ["unit.functions"],
          proposedOfficialId: "skill.rational_function_behavior",
          relatedTagIds: ["skill.function_notation"],
        },
        {
          aliases: ["piecewise"],
          description: "Evaluate or interpret piecewise-defined functions.",
          exampleSignals: ["piecewise", "defined by", "interval"],
          label: "Piecewise function evaluation",
          level: "skill",
          parentTagIds: ["unit.functions"],
          proposedOfficialId: "skill.piecewise_function_evaluation",
          relatedTagIds: ["skill.function_notation"],
        },
        {
          aliases: ["discount", "markup", "percent increase"],
          description: "Model percent change in applied contexts.",
          exampleSignals: ["discount", "markup", "percent increase"],
          label: "Applied percent change",
          level: "skill",
          parentTagIds: ["unit.ratios_percentages"],
          proposedOfficialId: "skill.applied_percent_change",
          relatedTagIds: ["skill.percent_change"],
        },
        {
          aliases: ["margin of error", "sample proportion"],
          description: "Reason about sample estimates and margins of error.",
          exampleSignals: ["margin of error", "sample", "survey"],
          label: "Sample estimate interpretation",
          level: "skill",
          parentTagIds: ["unit.statistics"],
          proposedOfficialId: "skill.sample_estimate_interpretation",
          relatedTagIds: ["skill.mean_median"],
        },
        {
          aliases: ["grid-in", "student-produced response"],
          description: "SAT numeric-response item format.",
          exampleSignals: ["grid-in", "enter your answer", "student-produced"],
          label: "Grid-in numeric response",
          level: "format",
          parentTagIds: [],
          proposedOfficialId: "format.grid_in_numeric",
          relatedTagIds: ["format.numeric_input"],
        },
      ],
    }),
    buildDraftPack({
      description: "General math expansion for common classroom skills and misconceptions.",
      kind: "course",
      label: "General Math v1 draft",
      packId: "general_math_v1_draft",
      seeds: [
        {
          aliases: ["combine like terms"],
          description: "Simplify expressions by collecting like terms.",
          exampleSignals: ["combine like terms", "simplify expression"],
          label: "Combine like terms",
          level: "skill",
          parentTagIds: ["domain.algebra"],
          proposedOfficialId: "skill.combine_like_terms",
          relatedTagIds: ["skill.polynomial_operations"],
        },
        {
          aliases: ["distribute", "distributive property"],
          description: "Apply the distributive property to expand expressions.",
          exampleSignals: ["distribute", "expand", "parentheses"],
          label: "Distributive property",
          level: "skill",
          parentTagIds: ["domain.algebra"],
          proposedOfficialId: "skill.distributive_property",
          relatedTagIds: ["skill.polynomial_operations"],
        },
        {
          aliases: ["unit conversion", "dimensional analysis"],
          commonErrorTypeTagIds: ["error.unit_error"],
          description: "Convert between units in proportional contexts.",
          exampleSignals: ["convert units", "meters per second", "unit rate"],
          label: "Unit conversion",
          level: "skill",
          parentTagIds: ["unit.ratios_percentages"],
          proposedOfficialId: "skill.unit_conversion",
          relatedTagIds: ["skill.ratio_proportion"],
        },
        {
          aliases: ["scale factor", "similarity ratio"],
          description: "Use scale factors in similar figures or models.",
          exampleSignals: ["scale factor", "similar figures", "model"],
          label: "Scale factor",
          level: "skill",
          parentTagIds: ["unit.triangles"],
          proposedOfficialId: "skill.scale_factor",
          relatedTagIds: ["skill.similar_triangles"],
        },
        {
          aliases: ["wrong sign", "sign mistake"],
          description: "Common algebraic error involving sign handling.",
          exampleSignals: ["negative sign", "subtracting negatives"],
          label: "Sign error",
          level: "error_type",
          parentTagIds: [],
          proposedOfficialId: "error.sign_error",
          relatedTagIds: ["error.algebra_manipulation_error"],
        },
      ],
    }),
    buildDraftPack({
      description: "AP Calculus AB starter expansion for limits and derivatives.",
      kind: "course",
      label: "AP Calculus AB v1 draft",
      packId: "ap_calculus_ab_v1_draft",
      seeds: [
        {
          aliases: ["limit from graph"],
          description: "Estimate or interpret limits using a graph or table.",
          exampleSignals: ["limit", "approaches", "from the graph"],
          label: "Limit interpretation",
          level: "skill",
          parentTagIds: ["course.ap_calculus_ab"],
          proposedOfficialId: "skill.limit_interpretation",
          relatedTagIds: ["skill.function_notation"],
        },
        {
          aliases: ["derivative as rate", "instantaneous rate"],
          description: "Interpret a derivative as an instantaneous rate of change.",
          exampleSignals: ["derivative", "instantaneous rate", "slope of tangent"],
          label: "Derivative as rate of change",
          level: "skill",
          parentTagIds: ["course.ap_calculus_ab"],
          proposedOfficialId: "skill.derivative_rate_of_change",
          relatedTagIds: ["skill.linear_rate_of_change"],
        },
      ],
    }),
    buildDraftPack({
      description: "AP Physics 1 starter expansion for mechanics.",
      kind: "course",
      label: "AP Physics 1 v1 draft",
      packId: "ap_physics_1_v1_draft",
      seeds: [
        {
          aliases: ["FBD", "force diagram"],
          description: "Interpret or construct a free-body diagram.",
          exampleSignals: ["free-body diagram", "forces acting on", "net force"],
          label: "Free-body diagram reasoning",
          level: "skill",
          parentTagIds: ["course.ap_physics_1"],
          proposedOfficialId: "skill.free_body_diagram_reasoning",
          relatedTagIds: ["subject.physics"],
        },
        {
          aliases: ["impulse momentum", "collision"],
          description: "Apply conservation of momentum or impulse-momentum ideas.",
          exampleSignals: ["momentum", "collision", "impulse"],
          label: "Momentum conservation",
          level: "skill",
          parentTagIds: ["course.ap_physics_1"],
          proposedOfficialId: "skill.momentum_conservation",
          relatedTagIds: ["subject.physics"],
        },
      ],
    }),
  ];
}

function refsForTarget(target: Record<string, unknown>) {
  return {
    packetHashes: uniqueStrings([stringValue(target.packetHash)]),
    packetIds: uniqueStrings([stringValue(target.packetId)]),
    pageNumbers: uniqueNumbers(asArray(target.sourcePages).map(Number)),
    targetIds: uniqueStrings([stringValue(target.targetId)]),
  };
}

function targetEvidence(
  target: Record<string, unknown>,
  kind: AITaxonomyEvidence["kind"],
  message: string,
) {
  return evidence({
    kind,
    message,
    packetIds: uniqueStrings([stringValue(target.packetId)]),
    pageNumbers: uniqueNumbers(asArray(target.sourcePages).map(Number)),
    snippet: stringValue(target.textPreview),
  });
}

function acceptedSuggestions(target: Record<string, unknown>) {
  return asArray(target.suggestions)
    .map(asRecord)
    .filter((suggestion) => stringValue(suggestion.status) !== "rejected_by_validator");
}

function rejectedSuggestions(target: Record<string, unknown>) {
  return asArray(target.suggestions)
    .map(asRecord)
    .filter((suggestion) => stringValue(suggestion.status) === "rejected_by_validator");
}

function firstParentSuggestion(target: Record<string, unknown>) {
  const accepted = acceptedSuggestions(target);
  const unit = accepted.find((suggestion) => stringValue(suggestion.level) === "unit");
  const domain = accepted.find(
    (suggestion) => stringValue(suggestion.level) === "domain",
  );
  const course = accepted.find(
    (suggestion) => stringValue(suggestion.level) === "course",
  );

  return stringValue((unit ?? domain ?? course)?.tagId) || "course.sat_math";
}

function nearestExistingTagsFor({
  draftPacks,
  label,
  level,
}: {
  draftPacks: AITaxonomyDraftPack[];
  label: string;
  level: AITagLevel;
}): AINearestExistingTagRef[] {
  const officialRefs = existingTaxonomyRefs();
  const draftRefs = draftPacks.flatMap((pack) =>
    pack.tagDrafts.map((tag) => ({
      id: tag.proposedOfficialId,
      label: tag.label,
      level: tag.level,
      parentIds: tag.parentTagIds,
    })),
  );

  return [...officialRefs, ...draftRefs]
    .map((tag) => ({
      label: tag.label,
      level: tag.level,
      reason:
        tag.level === level ? "same_level_token_similarity" : "token_similarity",
      similarity: tokenSimilarity(label, tag.label),
      tagId: tag.id,
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 3);
}

function candidateAction({
  confidence,
  nearestExistingTags,
}: {
  confidence: number;
  nearestExistingTags: AINearestExistingTagRef[];
}): AITaxonomyReviewAction {
  if (nearestExistingTags.some((tag) => tag.similarity >= 0.74)) {
    return "merge_as_alias";
  }

  if (confidence >= 0.76) {
    return "approve_as_official";
  }

  return "needs_more_evidence";
}

function createCandidate({
  draftPacks,
  input,
}: {
  draftPacks: AITaxonomyDraftPack[];
  input: CandidateInput;
}): AITagCandidateQueueItem {
  const nearestExistingTags = nearestExistingTagsFor({
    draftPacks,
    label: input.proposedLabel,
    level: input.proposedLevel,
  });
  const candidateHash = stableHash({
    label: input.proposedLabel,
    level: input.proposedLevel,
    parents: input.proposedParentTagIds,
    source: input.source,
    sourceRefs: input.sourceRefs,
  });
  const warnings: string[] = [];

  if (!input.evidence.length) {
    warnings.push("candidate_missing_evidence");
  }

  if (!input.proposedParentTagIds.length && !ROOT_LEVELS.has(input.proposedLevel)) {
    warnings.push("candidate_missing_parent");
  }

  if (nearestExistingTags.some((tag) => tag.similarity >= 0.74)) {
    warnings.push("taxonomy_bootstrap_duplicate_likely");
  }

  return {
    candidateHash,
    candidateId: `candidate-${candidateHash.slice(0, 12)}`,
    confidence: clampConfidence(input.confidence),
    evidence: input.evidence,
    nearestExistingTags,
    proposedAliases: uniqueStrings(input.proposedAliases ?? []).slice(
      0,
      MAX_ALIASES_PER_TAG,
    ),
    proposedLabel: input.proposedLabel,
    proposedLevel: input.proposedLevel,
    proposedParentTagIds: uniqueStrings(input.proposedParentTagIds),
    recommendedReviewAction: candidateAction({
      confidence: input.confidence,
      nearestExistingTags,
    }),
    source: input.source,
    sourceRefs: input.sourceRefs,
    status: "pending_review",
    warnings: uniqueStrings([...(input.warnings ?? []), ...warnings]),
  };
}

function buildCandidateQueue({
  draftPacks,
  taggingV2Plan,
}: {
  draftPacks: AITaxonomyDraftPack[];
  taggingV2Plan: Record<string, unknown>;
}) {
  const candidates: AITagCandidateQueueItem[] = [];
  const targets = asArray(taggingV2Plan.targets).map(asRecord);

  for (const target of targets) {
    const validation = asRecord(target.validation);
    const text = stringValue(target.textPreview);
    const normalizedText = normalizeText(text);
    const refs = refsForTarget(target);
    const genericOnly = validation.genericOnly === true;
    const accepted = acceptedSuggestions(target);
    const hasSkill = accepted.some((suggestion) =>
      ["skill", "subskill"].includes(stringValue(suggestion.level)),
    );
    const hasUnitOrDomain = accepted.some((suggestion) =>
      ["unit", "domain"].includes(stringValue(suggestion.level)),
    );

    if (genericOnly) {
      candidates.push(
        createCandidate({
          draftPacks,
          input: {
            confidence: 0.54,
            evidence: [
              targetEvidence(
                target,
                "generic_gap",
                "Tagging v2 only reached generic tags for this target.",
              ),
            ],
            proposedAliases: [],
            proposedLabel: `Missing skill for pages ${refs.pageNumbers.join(", ") || "unknown"}`,
            proposedLevel: "skill",
            proposedParentTagIds: [firstParentSuggestion(target)],
            source: "tagging_v2_generic_only",
            sourceRefs: refs,
          },
        }),
      );
    }

    for (const suggestion of rejectedSuggestions(target)) {
      const tagId = stringValue(suggestion.tagId);
      const label =
        stringValue(suggestion.label) ||
        tagId.split(".").pop()?.replace(/_/g, " ") ||
        "Rejected freeform tag";
      candidates.push(
        createCandidate({
          draftPacks,
          input: {
            confidence: numberValue(suggestion.confidence, 0.45),
            evidence: [
              targetEvidence(
                target,
                "validator_rejection",
                "Tagging v2 rejected a freeform or unknown tag attempt.",
              ),
            ],
            proposedAliases: [tagId].filter(Boolean),
            proposedLabel: label,
            proposedLevel: validateLevel(stringValue(suggestion.level)),
            proposedParentTagIds: asArray(suggestion.parentTagIds).map(String),
            source: "tagging_v2_rejected_freeform",
            sourceRefs: refs,
            warnings: ["candidate_from_rejected_tagging_v2_suggestion"],
          },
        }),
      );
    }

    if (hasUnitOrDomain && !hasSkill) {
      candidates.push(
        createCandidate({
          draftPacks,
          input: {
            confidence: 0.5,
            evidence: [
              targetEvidence(
                target,
                "generic_gap",
                "Tagging v2 reached a unit/domain but no skill or subskill.",
              ),
            ],
            proposedLabel: `Missing skill under ${firstParentSuggestion(target)}`,
            proposedLevel: "skill",
            proposedParentTagIds: [firstParentSuggestion(target)],
            source: "missing_skill_gap",
            sourceRefs: refs,
          },
        }),
      );
    }

    const signalCandidates: Array<{
      aliases?: string[];
      label: string;
      level: AITagLevel;
      parents: string[];
      pattern: RegExp;
    }> = [
      {
        aliases: ["asymptote", "rational expression"],
        label: "Rational function asymptotes",
        level: "skill",
        parents: ["unit.functions"],
        pattern: /\brational\b|\basymptote\b/,
      },
      {
        aliases: ["piecewise"],
        label: "Piecewise function intervals",
        level: "skill",
        parents: ["unit.functions"],
        pattern: /\bpiecewise\b|\binterval\b/,
      },
      {
        aliases: ["matrix"],
        label: "Matrix operations",
        level: "skill",
        parents: ["domain.algebra"],
        pattern: /\bmatrix\b|\bmatrices\b/,
      },
      {
        aliases: ["complex plane"],
        label: "Complex number operations",
        level: "skill",
        parents: ["domain.advanced_math"],
        pattern: /\bcomplex number\b|\bimaginary\b/,
      },
      {
        aliases: ["calculator active", "no calculator"],
        label: "Calculator policy format",
        level: "format",
        parents: [],
        pattern: /\bcalculator\b|\bno calculator\b/,
      },
      {
        aliases: ["careless mistake"],
        label: "Arithmetic slip",
        level: "error_type",
        parents: [],
        pattern: /\barithmetic error\b|\bcareless\b|\bcalculation mistake\b/,
      },
    ];

    for (const signal of signalCandidates) {
      if (signal.pattern.test(normalizedText)) {
        candidates.push(
          createCandidate({
            draftPacks,
            input: {
              confidence: 0.62,
              evidence: [
                targetEvidence(
                  target,
                  signal.level === "format" ? "format_hint" : "text_signal",
                  "Strong deterministic text signal suggests a missing taxonomy entry.",
                ),
              ],
              proposedAliases: signal.aliases,
              proposedLabel: signal.label,
              proposedLevel: signal.level,
              proposedParentTagIds: signal.parents,
              source: "missing_skill_gap",
              sourceRefs: refs,
            },
          }),
        );
      }
    }
  }

  const byHash = new Map<string, AITagCandidateQueueItem>();
  for (const candidate of candidates) {
    const existing = byHash.get(candidate.candidateHash);

    if (!existing || candidate.confidence > existing.confidence) {
      byHash.set(candidate.candidateHash, candidate);
    }
  }

  return Array.from(byHash.values()).slice(0, MAX_CANDIDATES);
}

function aliasEvidenceFromTargets(
  targets: Record<string, unknown>[],
  aliases: string[],
) {
  return targets
    .filter((target) => {
      const text = normalizeText(stringValue(target.textPreview));
      return aliases.some((alias) => text.includes(normalizeText(alias)));
    })
    .slice(0, 3)
    .map((target) =>
      evidence({
        kind: "alias_signal",
        message: "Deterministic alias signal found in packet preview.",
        packetIds: uniqueStrings([stringValue(target.packetId)]),
        pageNumbers: uniqueNumbers(asArray(target.sourcePages).map(Number)),
        snippet: stringValue(target.textPreview),
      }),
    );
}

function buildAliasCandidates({
  candidateQueue,
  taggingV2Plan,
}: {
  candidateQueue: AITagCandidateQueueItem[];
  taggingV2Plan: Record<string, unknown>;
}): AITagAliasCandidate[] {
  const targets = asArray(taggingV2Plan.targets).map(asRecord);
  const groups = [
    {
      aliases: ["slope", "rate of change", "constant rate of change", "linear rate"],
      targetTagId: "skill.slope_intercept",
    },
    {
      aliases: ["zeros", "roots", "x-intercepts", "difference of squares"],
      targetTagId: "skill.factor_quadratic",
    },
    {
      aliases: ["given that", "conditional chance", "probability from table"],
      targetTagId: "skill.conditional_probability",
    },
    {
      aliases: ["percent increase", "percentage change", "markup", "discount"],
      targetTagId: "skill.percent_change",
    },
  ];
  const aliasCandidates: AITagAliasCandidate[] = [];

  for (const group of groups) {
    const target = findControlledTaxonomyRef(group.targetTagId);

    if (!target) {
      continue;
    }

    for (const aliasText of group.aliases) {
      const evidenceItems = aliasEvidenceFromTargets(targets, [aliasText]);
      const sourceCandidateIds = candidateQueue
        .filter((candidate) =>
          [candidate.proposedLabel, ...candidate.proposedAliases]
            .map(normalizeText)
            .some((value) => value.includes(normalizeText(aliasText))),
        )
        .map((candidate) => candidate.candidateId);

      if (!evidenceItems.length && !sourceCandidateIds.length) {
        continue;
      }

      const aliasCandidateHash = stableHash({
        aliasText,
        sourceCandidateIds,
        targetTagId: target.id,
      });
      aliasCandidates.push({
        aliasCandidateHash,
        aliasCandidateId: `alias-${aliasCandidateHash.slice(0, 12)}`,
        aliasText,
        confidence: sourceCandidateIds.length ? 0.72 : 0.66,
        evidence: evidenceItems.length
          ? evidenceItems
          : [
              evidence({
                kind: "alias_signal",
                message: "Alias proposed from candidate label similarity.",
                packetIds: [],
                pageNumbers: [],
                snippet: aliasText,
              }),
            ],
        sourceCandidateIds,
        status: "pending_review",
        targetLabel: target.label,
        targetTagId: target.id,
        warnings: ["taxonomy_bootstrap_aliases_pending_review"],
      });
    }
  }

  return aliasCandidates.slice(0, MAX_ALIAS_CANDIDATES);
}

function buildReviewActions({
  aliasCandidates,
  candidateQueue,
  draftPacks,
}: {
  aliasCandidates: AITagAliasCandidate[];
  candidateQueue: AITagCandidateQueueItem[];
  draftPacks: AITaxonomyDraftPack[];
}): AITaxonomyReviewActionDraft[] {
  const draftTagActions = draftPacks.flatMap((pack) =>
    pack.tagDrafts.map((tag): AITaxonomyReviewActionDraft => {
      const action: AITaxonomyReviewAction = tag.validation.duplicateLikely
        ? "merge_as_alias"
        : tag.validation.valid
          ? "approve_as_official"
          : tag.validation.errors.includes("missing_parent") ||
              tag.validation.errors.includes("unknown_or_pending_parent_missing")
            ? "move_parent"
            : "needs_more_evidence";

      return {
        confidence: tag.confidence,
        humanRequired: true,
        reason: tag.validation.valid
          ? "Draft tag is structurally valid but still requires taxonomy review."
          : `Draft tag validation: ${tag.validation.errors.join(", ")}`,
        recommendedAction: action,
        reviewActionId: `review-${stableHash({
          action,
          tagId: tag.draftTagId,
        }).slice(0, 12)}`,
        targetId: tag.draftTagId,
        targetType: "draft_tag",
      };
    }),
  );
  const candidateActions = candidateQueue.map(
    (candidate): AITaxonomyReviewActionDraft => ({
      confidence: candidate.confidence,
      humanRequired: true,
      reason: candidate.warnings.length
        ? candidate.warnings.join(", ")
        : "Candidate tag requires human taxonomy review.",
      recommendedAction: candidate.recommendedReviewAction,
      reviewActionId: `review-${stableHash({
        action: candidate.recommendedReviewAction,
        candidateId: candidate.candidateId,
      }).slice(0, 12)}`,
      targetId: candidate.candidateId,
      targetType: "candidate_tag",
    }),
  );
  const aliasActions = aliasCandidates.map(
    (alias): AITaxonomyReviewActionDraft => ({
      confidence: alias.confidence,
      humanRequired: true,
      reason: "Alias candidate must be reviewed before it can be merged.",
      recommendedAction: "merge_as_alias",
      reviewActionId: `review-${stableHash({
        action: "merge_as_alias",
        aliasId: alias.aliasCandidateId,
      }).slice(0, 12)}`,
      targetId: alias.aliasCandidateId,
      targetType: "alias_candidate",
    }),
  );

  return [...draftTagActions, ...candidateActions, ...aliasActions];
}

function planStats({
  aliasCandidates,
  candidateQueue,
  draftPacks,
  reviewActions,
}: {
  aliasCandidates: AITagAliasCandidate[];
  candidateQueue: AITagCandidateQueueItem[];
  draftPacks: AITaxonomyDraftPack[];
  reviewActions: AITaxonomyReviewActionDraft[];
}): AITaxonomyBootstrapPlanStats {
  const draftTags = draftPacks.flatMap((pack) => pack.tagDrafts);

  return {
    aliasCandidateCount: aliasCandidates.length,
    candidateQueueCount: candidateQueue.length,
    draftPackCount: draftPacks.length,
    draftTagCount: draftTags.length,
    duplicateLikelyCount:
      draftTags.filter((tag) => tag.validation.duplicateLikely).length +
      candidateQueue.filter((candidate) =>
        candidate.warnings.includes("taxonomy_bootstrap_duplicate_likely"),
      ).length,
    needsParentReviewCount: draftTags.filter(
      (tag) => tag.status === "needs_parent_review",
    ).length,
    rejectedOrInvalidCount: draftTags.filter((tag) => !tag.validation.valid).length,
    reviewActionCount: reviewActions.length,
  };
}

export function buildAITaxonomyBootstrapPlanFromSummary(
  aiPdfImport: Record<string, unknown>,
): AITaxonomyBootstrapPlan {
  const warnings = [
    "taxonomy_bootstrap_planning_only",
    "taxonomy_bootstrap_no_ai_generation",
    "taxonomy_bootstrap_no_official_tag_write",
  ];
  const sourceKind = sourceKindFromSummary(aiPdfImport);
  const taggingV2Plan = asRecord(aiPdfImport.taggingV2Plan);
  const draftPacks = buildStarterTaxonomyDraftPacks();

  if (!taggingV2Plan.version) {
    warnings.push("taxonomy_bootstrap_missing_tagging_v2_plan");
  }

  const candidateQueue = buildCandidateQueue({ draftPacks, taggingV2Plan });
  const aliasCandidates = buildAliasCandidates({ candidateQueue, taggingV2Plan });
  const reviewActions = buildReviewActions({
    aliasCandidates,
    candidateQueue,
    draftPacks,
  });
  const stats = planStats({
    aliasCandidates,
    candidateQueue,
    draftPacks,
    reviewActions,
  });

  if (candidateQueue.length > 0) {
    warnings.push("taxonomy_bootstrap_candidates_pending_review");
  }

  if (aliasCandidates.length > 0) {
    warnings.push("taxonomy_bootstrap_aliases_pending_review");
  }

  if (stats.duplicateLikelyCount > 0) {
    warnings.push("taxonomy_bootstrap_duplicate_likely");
  }

  return {
    aliasCandidates,
    candidateQueue,
    draftPacks,
    generatedAt: new Date().toISOString(),
    mode: "planning_only",
    reviewActions,
    sourceKind,
    stats,
    status:
      draftPacks.length === 0
        ? "skipped"
        : warnings.length > 3 ||
            stats.duplicateLikelyCount > 0 ||
            stats.rejectedOrInvalidCount > 0
          ? "completed_with_warnings"
          : "completed",
    taxonomyVersion: "edu_taxonomy_v1",
    version: "taxonomy_bootstrap_plan_v1",
    warnings: uniqueStrings(warnings),
  };
}

export function failedAITaxonomyBootstrapPlan({
  generatedAt = new Date().toISOString(),
  sourceKind = "pdf",
  warnings,
}: {
  generatedAt?: string;
  sourceKind?: "pdf" | "single_image";
  warnings: string[];
}): AITaxonomyBootstrapPlan {
  return {
    aliasCandidates: [],
    candidateQueue: [],
    draftPacks: [],
    generatedAt,
    mode: "planning_only",
    reviewActions: [],
    sourceKind,
    stats: {
      aliasCandidateCount: 0,
      candidateQueueCount: 0,
      draftPackCount: 0,
      draftTagCount: 0,
      duplicateLikelyCount: 0,
      needsParentReviewCount: 0,
      rejectedOrInvalidCount: 0,
      reviewActionCount: 0,
    },
    status: "failed",
    taxonomyVersion: "edu_taxonomy_v1",
    version: "taxonomy_bootstrap_plan_v1",
    warnings,
  };
}

export function mergeAITaxonomyBootstrapPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  taxonomyBootstrapPlan: AITaxonomyBootstrapPlan,
) {
  return {
    ...existingAiPdfImport,
    taxonomyBootstrapPlan,
  };
}
