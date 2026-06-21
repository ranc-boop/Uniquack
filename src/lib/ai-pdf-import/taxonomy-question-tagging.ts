import { createRequire } from "node:module";

import type {
  TaxonomyTagBundleValidationResult,
  NormalizedTaxonomyTagBundle,
} from "@/lib/tags/taxonomy-tag-catalog";
import type { AITaxonomyTagCategory } from "@/lib/ai-pdf-import/taxonomy-tag-taxonomy";

const require = createRequire(import.meta.url);
const {
  getCurriculumConceptMappings,
  listTaxonomyTagsByCategory,
  normalizeTaxonomyTagBundle,
  resolveTaxonomyAlias,
  validateTaxonomyTagBundle,
} = require("../tags/taxonomy-tag-catalog.ts") as typeof import("@/lib/tags/taxonomy-tag-catalog");

export type AITaxonomyQuestionTaggingPlanVersion =
  "taxonomy_question_tagging_plan_v1";

export type AITaxonomyQuestionTaggingPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export interface AITaxonomyQuestionRef {
  id?: string;
  questionCode?: string;
  sourcePages: number[];
  titlePreview: string;
}

export interface AITaxonomyQuestionTaggingEvidence {
  matchedAliases: string[];
  matchedSignals: string[];
  safeTextPreview: string;
}

export interface AITaxonomyQuestionTaggingSuggestion {
  confidence: number;
  difficultySuggestion: number;
  evidence: AITaxonomyQuestionTaggingEvidence;
  questionRef: AITaxonomyQuestionRef;
  reviewRequired: true;
  tags: Record<AITaxonomyTagCategory, string[]>;
  validation: TaxonomyTagBundleValidationResult;
  warnings: string[];
}

export interface AITaxonomyQuestionTaggingPlan {
  generatedAt: string;
  itemCount: number;
  mode: "planning_only";
  source: "rule_based_catalog";
  status: AITaxonomyQuestionTaggingPlanStatus;
  suggestions: AITaxonomyQuestionTaggingSuggestion[];
  validation: {
    allBundlesValidated: boolean;
    difficultyIsNumeric: true;
    errorPatternIsNotQuestionTag: true;
    noDbMutation: true;
    noOfficialTagWrite: true;
    noProviderCall: true;
    noReviewDraftTagWrite: true;
  };
  version: AITaxonomyQuestionTaggingPlanVersion;
  warnings: string[];
}

interface QuestionTarget {
  id?: string;
  questionCode?: string;
  sourcePages: number[];
  text: string;
  title: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringList(value: unknown) {
  return asArray(value).filter((item): item is string => typeof item === "string");
}

function numberList(value: unknown) {
  return asArray(value)
    .map(Number)
    .filter((item) => Number.isFinite(item) && item > 0);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function boundedText(value: string, maxLength = 500) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact;
}

function includesAny(text: string, signals: string[]) {
  return signals.some((signal) => text.includes(signal));
}

function addTag(tags: Record<AITaxonomyTagCategory, string[]>, category: AITaxonomyTagCategory, tagId: string) {
  tags[category] = uniqueStrings([...tags[category], tagId]);
}

function confidenceFor({ matchedSignals, validation }: { matchedSignals: string[]; validation: TaxonomyTagBundleValidationResult }) {
  const base = validation.valid ? 0.58 : 0.42;
  const signalBoost = Math.min(0.3, matchedSignals.length * 0.04);
  const warningPenalty = Math.min(0.12, validation.warnings.length * 0.03);
  return Math.max(0.1, Math.min(0.92, Number((base + signalBoost - warningPenalty).toFixed(2))));
}

function difficultyFor(text: string) {
  let score = 0.45;
  if (includesAny(text, ["chain rule", "derivative", "optimize", "optimization", "justify", "prove"])) score += 0.15;
  if (includesAny(text, ["model", "word problem", "projectile", "context"])) score += 0.08;
  if (includesAny(text, ["identify", "read from graph", "table"])) score -= 0.06;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function curriculumCandidatesForConcepts(conceptTagIds: string[]) {
  const curriculumTags = listTaxonomyTagsByCategory("curriculum");
  const matches: string[] = [];
  for (const curriculum of curriculumTags) {
    const mappedConceptIds = getCurriculumConceptMappings(curriculum.tagId).map(
      (node) => node.tagId,
    );
    if (mappedConceptIds.some((tagId) => conceptTagIds.includes(tagId))) {
      matches.push(curriculum.tagId);
    }
  }
  return matches;
}

function applyDefaultMinimums(
  tags: Record<AITaxonomyTagCategory, string[]>,
  text: string,
) {
  if (!tags.concept.length) addTag(tags, "concept", "concept.algebra.functions");
  if (!tags.task.length) addTag(tags, "task", "task.determine.determine_value");
  if (!tags.form.length) {
    addTag(
      tags,
      "form",
      includesAny(text, ["word", "context", "projectile"])
        ? "form.verbal.word_problem"
        : "form.symbolic.equation_system",
    );
  }
  if (!tags.curriculum.length) {
    const curriculumMatches = curriculumCandidatesForConcepts(tags.concept);
    addTag(
      tags,
      "curriculum",
      curriculumMatches[0] ?? "curriculum.bc.precalculus_11.linear_relations",
    );
  }
}

function suggestTagsForText(text: string) {
  const tags: Record<AITaxonomyTagCategory, string[]> = {
    concept: [],
    curriculum: [],
    form: [],
    method: [],
    task: [],
  };
  const matchedAliases: string[] = [];
  const matchedSignals: string[] = [];
  const lower = text.toLowerCase();
  const warnings: string[] = [];

  for (const alias of [
    "quadratic max",
    "maximum value",
    "where maximum occurs",
    "x value of vertex",
    "vertex form",
    "complete square",
    "read graph",
    "chain rule",
    "composite derivative",
    "vertex",
  ]) {
    if (!lower.includes(alias)) continue;
    if (alias === "vertex" && lower.includes("vertex form")) continue;
    const resolution = resolveTaxonomyAlias(alias);
    matchedAliases.push(alias);
    if (resolution.ambiguous) {
      warnings.push(`ambiguous_alias:${alias}`);
      for (const node of resolution.nodes) addTag(tags, node.category, node.tagId);
      continue;
    }
    for (const node of resolution.nodes) addTag(tags, node.category, node.tagId);
  }

  if (includesAny(lower, ["quadratic", "parabola", "vertex"])) {
    matchedSignals.push("quadratic_vertex_family");
    addTag(tags, "concept", "concept.algebra.functions.quadratic");
    addTag(tags, "concept", "concept.algebra.functions.quadratic.vertex");
  }
  if (includesAny(lower, ["maximum", "minimum", "extreme value", "max", "min"])) {
    matchedSignals.push("extreme_value");
    addTag(tags, "concept", "concept.algebra.functions.quadratic.extreme_value");
    addTag(tags, "task", "task.determine.determine_extreme_value");
  }
  if (includesAny(lower, ["where", "x-value", "x value", "occurs"])) {
    matchedSignals.push("where_value_occurs");
    addTag(tags, "concept", "concept.algebra.functions.quadratic.where_extreme_occurs");
    addTag(tags, "task", "task.determine.determine_where_extreme_occurs");
  }
  if (includesAny(lower, ["chain rule", "composite derivative", "derivative"])) {
    matchedSignals.push("calculus_derivative");
    addTag(tags, "concept", "concept.calculus.derivatives");
    if (includesAny(lower, ["chain rule", "composite"])) {
      addTag(tags, "concept", "concept.calculus.derivatives.chain_rule");
    }
    addTag(tags, "method", "method.formula_based.use_derivative_rule");
  }
  if (includesAny(lower, ["complete square", "complete the square"])) {
    matchedSignals.push("complete_square");
    addTag(tags, "method", "method.algebraic_manipulation.complete_the_square");
  }
  if (includesAny(lower, ["factor", "factored"])) {
    matchedSignals.push("factor");
    addTag(tags, "method", "method.algebraic_manipulation.factor");
  }
  if (includesAny(lower, ["formula", "axis of symmetry"])) {
    matchedSignals.push("formula");
    addTag(tags, "method", "method.formula_based.use_axis_of_symmetry_formula");
  }
  if (includesAny(lower, ["graph", "coordinate", "plot"])) {
    matchedSignals.push("graph_form");
    addTag(tags, "form", "form.graph.coordinate_graph");
    addTag(tags, "method", "method.graph_reasoning.read_from_graph");
  }
  if (includesAny(lower, ["table", "data table", "input-output"])) {
    matchedSignals.push("table_form");
    addTag(tags, "form", "form.table.data_table");
  }
  if (includesAny(lower, ["vertex form"])) addTag(tags, "form", "form.symbolic.vertex_form");
  if (includesAny(lower, ["standard form"])) addTag(tags, "form", "form.symbolic.standard_form");
  if (includesAny(lower, ["word problem", "context", "projectile"])) {
    matchedSignals.push("verbal_context");
    addTag(tags, "form", "form.verbal.word_problem");
    if (lower.includes("projectile")) addTag(tags, "form", "form.context.projectile_motion");
  }
  if (includesAny(lower, ["determine", "find", "calculate"])) {
    matchedSignals.push("determine_task");
    addTag(tags, "task", "task.determine.determine_value");
  }
  if (includesAny(lower, ["identify"])) {
    matchedSignals.push("identify_task");
    addTag(tags, "task", "task.identify.identify_graph_feature");
  }
  if (includesAny(lower, ["explain", "justify"])) {
    matchedSignals.push("explain_task");
    addTag(tags, "task", "task.explain.explain_reasoning");
  }
  if (includesAny(lower, ["rewrite", "simplify"])) {
    matchedSignals.push("rewrite_task");
    addTag(tags, "task", lower.includes("vertex") ? "task.rewrite.rewrite_to_vertex_form" : "task.rewrite.simplify_expression");
  }
  if (includesAny(lower, ["model", "optimize"])) {
    matchedSignals.push("model_task");
    addTag(tags, "task", lower.includes("optimize") ? "task.model.optimize_quantity" : "task.model.build_model");
    addTag(tags, "method", "method.modeling.build_equation");
  }

  const curriculumMatches = curriculumCandidatesForConcepts(tags.concept);
  for (const curriculumTagId of curriculumMatches.slice(0, 3)) {
    addTag(tags, "curriculum", curriculumTagId);
  }

  applyDefaultMinimums(tags, lower);

  return { matchedAliases, matchedSignals, tags, warnings };
}

function targetFromRecord(record: Record<string, unknown>, index: number): QuestionTarget {
  const title = stringValue(record.title) || stringValue(record.questionCode) || `Question ${index + 1}`;
  const textSignals = [
    title,
    stringValue(record.questionCode),
    stringValue(record.contentPreview),
    stringValue(record.solutionPreview),
    stringList(record.imageUrls).join(" "),
  ];

  return {
    id: stringValue(record.id) || undefined,
    questionCode: stringValue(record.questionCode) || undefined,
    sourcePages: numberList(record.sourcePages),
    text: boundedText(textSignals.join(" "), 500),
    title: boundedText(title, 120),
  };
}

function extractQuestionTargetsFromSummary(summary: Record<string, unknown>) {
  const createdQuestions = asArray(summary.createdQuestions)
    .map(asRecord)
    .map(targetFromRecord);

  if (createdQuestions.length) return createdQuestions;

  const aiPdfImport = asRecord(summary.aiPdfImport);
  const taggingPlan = asRecord(aiPdfImport.taggingV2Plan);
  return asArray(taggingPlan.targets).map(asRecord).map(targetFromRecord);
}

export function buildTaxonomyQuestionTaggingPlanFromSummary(
  summary: Record<string, unknown>,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): AITaxonomyQuestionTaggingPlan {
  const targets = extractQuestionTargetsFromSummary(summary).slice(0, 100);
  const suggestions = targets.map((target, index) => {
    const suggestion = suggestTagsForText(`${target.title} ${target.text}`);
    const normalized = normalizeTaxonomyTagBundle({
      difficulty: difficultyFor(`${target.title} ${target.text}`),
      tags: suggestion.tags,
    });
    const validation = validateTaxonomyTagBundle(normalized);
    const warnings = uniqueStrings([
      ...suggestion.warnings,
      ...validation.warnings,
      ...(validation.valid ? [] : ["taxonomy_bundle_validation_failed"]),
    ]);

    return {
      confidence: confidenceFor({
        matchedSignals: [...suggestion.matchedAliases, ...suggestion.matchedSignals],
        validation,
      }),
      difficultySuggestion: normalized.difficulty ?? difficultyFor(target.text),
      evidence: {
        matchedAliases: suggestion.matchedAliases,
        matchedSignals: suggestion.matchedSignals,
        safeTextPreview: boundedText(target.text, 240),
      },
      questionRef: {
        id: target.id,
        questionCode: target.questionCode ?? `question-${index + 1}`,
        sourcePages: target.sourcePages,
        titlePreview: target.title,
      },
      reviewRequired: true,
      tags: normalized.tags,
      validation,
      warnings,
    } satisfies AITaxonomyQuestionTaggingSuggestion;
  });
  const warnings = uniqueStrings([
    "taxonomy_question_tagging_planning_only",
    "taxonomy_question_tagging_no_db_write",
    "taxonomy_question_tagging_no_official_tag_write",
    "taxonomy_question_tagging_no_review_draft_write",
    ...(targets.length ? [] : ["taxonomy_question_tagging_no_targets"]),
    ...suggestions.flatMap((item) => item.warnings),
  ]);

  return {
    generatedAt,
    itemCount: suggestions.length,
    mode: "planning_only",
    source: "rule_based_catalog",
    status: suggestions.length
      ? warnings.length > 4
        ? "completed_with_warnings"
        : "completed"
      : "skipped",
    suggestions,
    validation: {
      allBundlesValidated: suggestions.every((item) => item.validation.valid),
      difficultyIsNumeric: true,
      errorPatternIsNotQuestionTag: true,
      noDbMutation: true,
      noOfficialTagWrite: true,
      noProviderCall: true,
      noReviewDraftTagWrite: true,
    },
    version: "taxonomy_question_tagging_plan_v1",
    warnings,
  };
}

export function failedTaxonomyQuestionTaggingPlan({
  generatedAt = new Date().toISOString(),
  warnings = [],
}: {
  generatedAt?: string;
  warnings?: string[];
} = {}): AITaxonomyQuestionTaggingPlan {
  return {
    generatedAt,
    itemCount: 0,
    mode: "planning_only",
    source: "rule_based_catalog",
    status: "failed",
    suggestions: [],
    validation: {
      allBundlesValidated: false,
      difficultyIsNumeric: true,
      errorPatternIsNotQuestionTag: true,
      noDbMutation: true,
      noOfficialTagWrite: true,
      noProviderCall: true,
      noReviewDraftTagWrite: true,
    },
    version: "taxonomy_question_tagging_plan_v1",
    warnings: uniqueStrings([
      "taxonomy_question_tagging_failed",
      ...warnings,
    ]),
  };
}

export function mergeTaxonomyQuestionTaggingPlanIntoSummary(
  aiPdfImport: Record<string, unknown> | null | undefined,
  taxonomyQuestionTaggingPlan: AITaxonomyQuestionTaggingPlan,
) {
  return {
    ...(aiPdfImport ?? {}),
    taxonomyQuestionTaggingPlan,
  };
}
