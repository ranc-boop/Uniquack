import { createRequire } from "node:module";

import type {
  AITaxonomyAliasCollision,
  AITaxonomyAliasIndex,
  AITaxonomyTagCategory,
  AITaxonomyTagTaxonomy,
  AITagNode,
  AITagTree,
} from "../ai-pdf-import/taxonomy-tag-taxonomy";

const require = createRequire(import.meta.url);
const { buildTaxonomyAliasIndex, buildTaxonomyTagTaxonomy } = require(
  "../ai-pdf-import/taxonomy-tag-taxonomy.ts",
) as typeof import("../ai-pdf-import/taxonomy-tag-taxonomy");

export const TAXONOMY_TAG_CATEGORIES = [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
] as const satisfies readonly AITaxonomyTagCategory[];

export type TaxonomyTagBundleTags = Record<AITaxonomyTagCategory, string[]>;

export interface TaxonomyTagBundle {
  difficulty?: number;
  tags: Partial<Record<AITaxonomyTagCategory | string, string[]>>;
}

export interface NormalizedTaxonomyTagBundle {
  difficulty?: number;
  tags: TaxonomyTagBundleTags;
}

export interface TaxonomyTagBundleValidationResult {
  errors: string[];
  normalized: NormalizedTaxonomyTagBundle;
  valid: boolean;
  warnings: string[];
}

export interface TaxonomyAliasResolution {
  alias: string;
  ambiguous: boolean;
  collision?: AITaxonomyAliasCollision;
  normalizedAlias: string;
  nodes: AITagNode[];
  tagIds: string[];
}

export interface TaxonomyTagCatalogSummary {
  aliasCollisionCount: number;
  categoryCount: number;
  curriculumConceptMappingCount: number;
  difficultyIsTaxonomyCategory: false;
  errorPatternIsQuestionTaxonomy: false;
  nodeCount: number;
  noDbWrite: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
}

export interface TaxonomyTagCatalog {
  aliasIndex: AITaxonomyAliasIndex;
  childrenByTagId: ReadonlyMap<string, readonly AITagNode[]>;
  curriculumConceptMappings: ReadonlyMap<string, readonly string[]>;
  nodeByTagId: ReadonlyMap<string, AITagNode>;
  parentByTagId: ReadonlyMap<string, readonly AITagNode[]>;
  taxonomy: AITaxonomyTagTaxonomy;
}

const BUNDLE_LIMITS: Record<
  AITaxonomyTagCategory,
  { max: number; min: number }
> = {
  concept: { max: 4, min: 1 },
  curriculum: { max: 3, min: 1 },
  form: { max: 3, min: 1 },
  method: { max: 3, min: 0 },
  task: { max: 3, min: 1 },
};
const TOTAL_BUNDLE_TAG_MAX = 12;

function normalizeAlias(aliasText: string) {
  return aliasText.trim().toLowerCase().replace(/\s+/g, " ");
}

function isTaxonomyTagCategory(
  category: string,
): category is AITaxonomyTagCategory {
  return TAXONOMY_TAG_CATEGORIES.includes(
    category as AITaxonomyTagCategory,
  );
}

function allTrees(taxonomy: AITaxonomyTagTaxonomy): AITagTree[] {
  return TAXONOMY_TAG_CATEGORIES.map((category) => taxonomy[category]);
}

function buildNodeByTagId(taxonomy: AITaxonomyTagTaxonomy) {
  return new Map(
    allTrees(taxonomy)
      .flatMap((tree) => tree.nodes)
      .map((node) => [node.tagId, node] as const),
  );
}

function buildParentByTagId(
  nodeByTagId: ReadonlyMap<string, AITagNode>,
  taxonomy: AITaxonomyTagTaxonomy,
) {
  return new Map(
    allTrees(taxonomy)
      .flatMap((tree) => tree.nodes)
      .map((node) => [
        node.tagId,
        node.parentTagIds
          .map((parentTagId) => nodeByTagId.get(parentTagId))
          .filter((parent): parent is AITagNode => Boolean(parent)),
      ] as const),
  );
}

function buildChildrenByTagId(
  nodeByTagId: ReadonlyMap<string, AITagNode>,
  taxonomy: AITaxonomyTagTaxonomy,
) {
  const children = new Map<string, AITagNode[]>();
  for (const node of allTrees(taxonomy).flatMap((tree) => tree.nodes)) {
    children.set(node.tagId, []);
  }

  for (const node of allTrees(taxonomy).flatMap((tree) => tree.nodes)) {
    for (const parentTagId of node.parentTagIds) {
      const parent = nodeByTagId.get(parentTagId);
      if (!parent) continue;
      children.set(parentTagId, [...(children.get(parentTagId) ?? []), node]);
    }
  }

  return children;
}

function buildCurriculumConceptMappingIndex(taxonomy: AITaxonomyTagTaxonomy) {
  const mappings = new Map<string, string[]>();
  for (const edge of allTrees(taxonomy).flatMap((tree) => tree.edges)) {
    if (edge.edgeKind !== "maps_to") continue;
    if (!edge.fromTagId.startsWith("curriculum.")) continue;
    if (!edge.toTagId.startsWith("concept.")) continue;
    mappings.set(edge.fromTagId, [
      ...(mappings.get(edge.fromTagId) ?? []),
      edge.toTagId,
    ]);
  }
  return mappings;
}

function buildCatalog(): TaxonomyTagCatalog {
  const taxonomy = buildTaxonomyTagTaxonomy();
  const nodeByTagId = buildNodeByTagId(taxonomy);
  const parentByTagId = buildParentByTagId(nodeByTagId, taxonomy);
  const childrenByTagId = buildChildrenByTagId(nodeByTagId, taxonomy);
  const curriculumConceptMappings = buildCurriculumConceptMappingIndex(taxonomy);

  return {
    aliasIndex: buildTaxonomyAliasIndex(taxonomy),
    childrenByTagId,
    curriculumConceptMappings,
    nodeByTagId,
    parentByTagId,
    taxonomy,
  };
}

export const TAXONOMY_TAG_CATALOG: TaxonomyTagCatalog = buildCatalog();

export function getTaxonomyTagCatalog() {
  return TAXONOMY_TAG_CATALOG;
}

export function listTaxonomyTagCategories(): AITaxonomyTagCategory[] {
  return [...TAXONOMY_TAG_CATEGORIES];
}

export function listTaxonomyTagNodes(): AITagNode[] {
  return allTrees(TAXONOMY_TAG_CATALOG.taxonomy).flatMap((tree) => [
    ...tree.nodes,
  ]);
}

export function listTaxonomyTagsByCategory(
  category: AITaxonomyTagCategory,
): AITagNode[] {
  return [...TAXONOMY_TAG_CATALOG.taxonomy[category].nodes];
}

export function getTaxonomyTagNode(tagId: string): AITagNode | null {
  return TAXONOMY_TAG_CATALOG.nodeByTagId.get(tagId) ?? null;
}

export function getTaxonomyTagChildren(tagId: string): AITagNode[] {
  return [...(TAXONOMY_TAG_CATALOG.childrenByTagId.get(tagId) ?? [])];
}

export function getTaxonomyTagParents(tagId: string): AITagNode[] {
  return [...(TAXONOMY_TAG_CATALOG.parentByTagId.get(tagId) ?? [])];
}

export function getTaxonomyTagAncestors(tagId: string): AITagNode[] {
  const ancestors: AITagNode[] = [];
  const seen = new Set<string>();
  const visit = (currentTagId: string) => {
    for (const parent of getTaxonomyTagParents(currentTagId)) {
      if (seen.has(parent.tagId)) continue;
      seen.add(parent.tagId);
      ancestors.push(parent);
      visit(parent.tagId);
    }
  };
  visit(tagId);
  return ancestors;
}

export function getTaxonomyTagDescendants(tagId: string): AITagNode[] {
  const descendants: AITagNode[] = [];
  const seen = new Set<string>();
  const visit = (currentTagId: string) => {
    for (const child of getTaxonomyTagChildren(currentTagId)) {
      if (seen.has(child.tagId)) continue;
      seen.add(child.tagId);
      descendants.push(child);
      visit(child.tagId);
    }
  };
  visit(tagId);
  return descendants;
}

export function getCurriculumConceptMappings(
  curriculumTagId: string,
): AITagNode[] {
  return [
    ...(TAXONOMY_TAG_CATALOG.curriculumConceptMappings.get(
      curriculumTagId,
    ) ?? []),
  ]
    .map((tagId) => getTaxonomyTagNode(tagId))
    .filter((node): node is AITagNode => Boolean(node));
}

export function resolveTaxonomyAlias(
  aliasText: string,
): TaxonomyAliasResolution {
  const normalizedAlias = normalizeAlias(aliasText);
  const mapping = TAXONOMY_TAG_CATALOG.aliasIndex.aliases.find(
    (candidate) => normalizeAlias(candidate.alias) === normalizedAlias,
  );
  const collision = TAXONOMY_TAG_CATALOG.aliasIndex.collisions.find(
    (candidate) => normalizeAlias(candidate.alias) === normalizedAlias,
  );
  const tagIds = mapping?.tagIds ?? [];

  return {
    alias: aliasText,
    ambiguous: tagIds.length > 1,
    collision,
    normalizedAlias,
    nodes: tagIds
      .map((tagId) => getTaxonomyTagNode(tagId))
      .filter((node): node is AITagNode => Boolean(node)),
    tagIds,
  };
}

export function validateTaxonomyTagId(tagId: string): {
  category?: AITaxonomyTagCategory;
  error?: string;
  node: AITagNode | null;
  valid: boolean;
} {
  const node = getTaxonomyTagNode(tagId);
  if (!node) {
    return {
      error: "unknown_taxonomy_tag_id",
      node: null,
      valid: false,
    };
  }

  return {
    category: node.category,
    node,
    valid: true,
  };
}

export function normalizeTaxonomyTagBundle(
  bundle: TaxonomyTagBundle,
): NormalizedTaxonomyTagBundle {
  const tags = Object.fromEntries(
    TAXONOMY_TAG_CATEGORIES.map((category) => [
      category,
      Array.from(new Set((bundle.tags[category] ?? []).map((tag) => tag.trim()).filter(Boolean))),
    ]),
  ) as TaxonomyTagBundleTags;

  return {
    difficulty: typeof bundle.difficulty === "number" ? bundle.difficulty : undefined,
    tags,
  };
}

export function validateTaxonomyTagBundle(
  bundle: TaxonomyTagBundle,
): TaxonomyTagBundleValidationResult {
  const normalized = normalizeTaxonomyTagBundle(bundle);
  const errors: string[] = [];
  const warnings: string[] = [];
  const inputCategories = Object.keys(bundle.tags);

  for (const category of inputCategories) {
    if (category === "difficulty") {
      errors.push("difficulty_is_numeric_field_not_taxonomy_category");
      continue;
    }
    if (category === "error_pattern") {
      errors.push("error_pattern_belongs_to_attempt_diagnosis");
      continue;
    }
    if (!isTaxonomyTagCategory(category)) {
      errors.push(`unknown_tag_category:${category}`);
    }
  }

  if (bundle.difficulty !== undefined) {
    if (
      typeof bundle.difficulty !== "number" ||
      Number.isNaN(bundle.difficulty) ||
      bundle.difficulty < 0 ||
      bundle.difficulty > 1
    ) {
      errors.push("difficulty_must_be_number_between_0_and_1");
    }
  }

  let totalTags = 0;
  for (const category of TAXONOMY_TAG_CATEGORIES) {
    const tags = normalized.tags[category];
    totalTags += tags.length;
    const limits = BUNDLE_LIMITS[category];
    if (tags.length < limits.min) {
      errors.push(`too_few_${category}_tags`);
    }
    if (tags.length > limits.max) {
      errors.push(`too_many_${category}_tags`);
    }
    for (const tagId of tags) {
      const node = getTaxonomyTagNode(tagId);
      if (!node) {
        errors.push(`unknown_tag:${tagId}`);
        continue;
      }
      if (node.category !== category) {
        errors.push(`wrong_category:${tagId}:expected_${category}`);
      }
    }
  }

  if (totalTags > TOTAL_BUNDLE_TAG_MAX) {
    errors.push("too_many_total_tags");
  }

  if (normalized.tags.concept.some((tagId) => /^concept\.(ap_|ib_|sat_|a_level_|bc\.)/.test(tagId))) {
    errors.push("concept_course_prefix_detected");
  }

  for (const curriculumTagId of normalized.tags.curriculum) {
    const mappings = getCurriculumConceptMappings(curriculumTagId);
    if (!mappings.length) {
      warnings.push(`curriculum_tag_has_no_concept_mapping:${curriculumTagId}`);
    }
  }

  return {
    errors,
    normalized,
    valid: errors.length === 0,
    warnings,
  };
}

export function summarizeTaxonomyTagCatalog(): TaxonomyTagCatalogSummary {
  const nodes = listTaxonomyTagNodes();
  const curriculumConceptMappingCount = Array.from(
    TAXONOMY_TAG_CATALOG.curriculumConceptMappings.values(),
  ).reduce((count, mappings) => count + mappings.length, 0);

  return {
    aliasCollisionCount: TAXONOMY_TAG_CATALOG.aliasIndex.collisions.length,
    categoryCount: TAXONOMY_TAG_CATEGORIES.length,
    curriculumConceptMappingCount,
    difficultyIsTaxonomyCategory: false,
    errorPatternIsQuestionTaxonomy: false,
    noDbWrite: true,
    noProviderCall: true,
    noReviewDraftWrite: true,
    nodeCount: nodes.length,
  };
}
