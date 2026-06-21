import type { TaxonomyCatalogView } from "@/components/tags/taxonomy-tag-tree-picker";

export type AITaxonomyQuestionTaggingPlanVersion =
  "taxonomy_question_tagging_plan_v2";

export interface AITaxonomyQuestionRef {
  id?: string;
  questionCode?: string;
  sourcePages: number[];
  titlePreview: string;
}

export interface TaxonomyTagBundleValidationResult {
  errors: string[];
  valid: boolean;
  warnings: string[];
}

export interface AITaxonomyQuestionTaggingSuggestion {
  confidence: number;
  difficultySuggestion: number;
  evidence: {
    matchedAliases: string[];
    matchedSignals: string[];
    safeTextPreview: string;
  };
  questionRef: AITaxonomyQuestionRef;
  reviewRequired: true;
  tags: Record<string, string[]>;
  validation: TaxonomyTagBundleValidationResult;
  warnings: string[];
}

export interface AITaxonomyQuestionTaggingPlan {
  generatedAt: string;
  itemCount: number;
  mode: "planning_only";
  source: "database_catalog";
  status: "completed" | "completed_with_warnings" | "skipped" | "failed";
  suggestions: AITaxonomyQuestionTaggingSuggestion[];
  validation: {
    allBundlesValidated: boolean;
    noDbMutation: true;
    noOfficialTagWrite: true;
    noProviderCall: true;
  };
  version: AITaxonomyQuestionTaggingPlanVersion;
  warnings: string[];
}

type QuestionTarget = {
  id?: string;
  questionCode?: string;
  sourcePages: number[];
  text: string;
  title: string;
};

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

function targetFromRecord(
  record: Record<string, unknown>,
  index: number,
): QuestionTarget {
  const title =
    stringValue(record.title) ||
    stringValue(record.questionCode) ||
    `Question ${index + 1}`;
  const text = [
    title,
    stringValue(record.questionCode),
    stringValue(record.contentPreview),
    stringValue(record.solutionPreview),
    stringList(record.imageUrls).join(" "),
  ].join(" ");

  return {
    id: stringValue(record.id) || undefined,
    questionCode: stringValue(record.questionCode) || undefined,
    sourcePages: numberList(record.sourcePages),
    text: boundedText(text),
    title: boundedText(title, 120),
  };
}

function extractTargets(summary: Record<string, unknown>) {
  const created = asArray(summary.createdQuestions)
    .map(asRecord)
    .map(targetFromRecord);
  if (created.length) return created;

  const aiPdfImport = asRecord(summary.aiPdfImport);
  const taggingPlan = asRecord(aiPdfImport.taggingV2Plan);
  return asArray(taggingPlan.targets).map(asRecord).map(targetFromRecord);
}

function difficultyFor(text: string) {
  const lower = text.toLowerCase();
  let score = 0.45;
  if (/(prove|justify|derive|optimization|chain rule)/.test(lower)) score += 0.18;
  if (/(model|context|multi-step)/.test(lower)) score += 0.08;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function suggestFromCatalog(text: string, catalog: TaxonomyCatalogView) {
  const lower = text.toLowerCase();
  const tags: Record<string, string[]> = Object.fromEntries(
    catalog.facets.map((facet) => [facet.facet_key, []]),
  );
  const matchedAliases: string[] = [];
  const matchedSignals: string[] = [];

  const candidates = catalog.nodes
    .filter((node) => node.facet_key)
    .map((node) => {
      const signals = uniqueStrings([
        node.label,
        ...(node.aliases ?? []),
        ...(node.description ? [node.description] : []),
      ])
        .map((signal) => signal.trim().toLowerCase())
        .filter((signal) => signal.length >= 3);
      const matches = signals.filter((signal) => lower.includes(signal));
      return { matches, node };
    })
    .filter((candidate) => candidate.matches.length)
    .sort(
      (left, right) =>
        Math.max(...right.matches.map((value) => value.length)) -
        Math.max(...left.matches.map((value) => value.length)),
    );

  for (const { matches, node } of candidates) {
    const facetKey = node.facet_key;
    if (!facetKey || (tags[facetKey]?.length ?? 0) >= 4) continue;
    tags[facetKey] = uniqueStrings([...(tags[facetKey] ?? []), node.tag_id]);
    matchedSignals.push(...matches);
    matchedAliases.push(
      ...(node.aliases ?? []).filter((alias) =>
        matches.includes(alias.toLowerCase()),
      ),
    );
  }

  const selectedCount = Object.values(tags).flat().length;
  const validation: TaxonomyTagBundleValidationResult = {
    errors: selectedCount ? [] : ["no_database_taxonomy_match"],
    valid: selectedCount > 0,
    warnings: catalog.facets
      .filter((facet) => !(tags[facet.facet_key]?.length ?? 0))
      .map((facet) => `no_${facet.facet_key}_suggestion`),
  };

  return {
    matchedAliases: uniqueStrings(matchedAliases),
    matchedSignals: uniqueStrings(matchedSignals),
    tags,
    validation,
  };
}

export function buildTaxonomyQuestionTaggingPlanFromSummary(
  summary: Record<string, unknown>,
  catalog: TaxonomyCatalogView,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): AITaxonomyQuestionTaggingPlan {
  const targets = extractTargets(summary).slice(0, 100);
  const suggestions = targets.map((target, index) => {
    const matched = suggestFromCatalog(`${target.title} ${target.text}`, catalog);
    const warnings = uniqueStrings([
      ...matched.validation.warnings,
      ...matched.validation.errors,
    ]);

    return {
      confidence: Math.min(
        0.9,
        Number((0.35 + matched.matchedSignals.length * 0.06).toFixed(2)),
      ),
      difficultySuggestion: difficultyFor(target.text),
      evidence: {
        matchedAliases: matched.matchedAliases,
        matchedSignals: matched.matchedSignals,
        safeTextPreview: boundedText(target.text, 240),
      },
      questionRef: {
        id: target.id,
        questionCode: target.questionCode ?? `question-${index + 1}`,
        sourcePages: target.sourcePages,
        titlePreview: target.title,
      },
      reviewRequired: true,
      tags: matched.tags,
      validation: matched.validation,
      warnings,
    } satisfies AITaxonomyQuestionTaggingSuggestion;
  });
  const warnings = uniqueStrings([
    ...(catalog.nodes.length ? [] : ["taxonomy_database_catalog_empty"]),
    ...(targets.length ? [] : ["taxonomy_question_tagging_no_targets"]),
    ...suggestions.flatMap((item) => item.warnings),
  ]);

  return {
    generatedAt,
    itemCount: suggestions.length,
    mode: "planning_only",
    source: "database_catalog",
    status: suggestions.length
      ? warnings.length
        ? "completed_with_warnings"
        : "completed"
      : "skipped",
    suggestions,
    validation: {
      allBundlesValidated: suggestions.every((item) => item.validation.valid),
      noDbMutation: true,
      noOfficialTagWrite: true,
      noProviderCall: true,
    },
    version: "taxonomy_question_tagging_plan_v2",
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
    source: "database_catalog",
    status: "failed",
    suggestions: [],
    validation: {
      allBundlesValidated: false,
      noDbMutation: true,
      noOfficialTagWrite: true,
      noProviderCall: true,
    },
    version: "taxonomy_question_tagging_plan_v2",
    warnings: uniqueStrings(["taxonomy_question_tagging_failed", ...warnings]),
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
