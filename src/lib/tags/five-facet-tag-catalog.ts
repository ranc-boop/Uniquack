import { createRequire } from "node:module";

import type {
  AIFiveFacetAliasCollision,
  AIFiveFacetAliasIndex,
  AIFiveFacetTagCategory,
  AIFiveFacetTagTaxonomy,
  AITagNode,
  AITagTree,
} from "../ai-pdf-import/five-facet-tag-taxonomy";

const require = createRequire(import.meta.url);
const { buildFiveFacetAliasIndex, buildFiveFacetTagTaxonomy } = require(
  "../ai-pdf-import/five-facet-tag-taxonomy.ts",
) as typeof import("../ai-pdf-import/five-facet-tag-taxonomy");

export const FIVE_FACET_TAG_CATEGORIES = [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
] as const satisfies readonly AIFiveFacetTagCategory[];

export type FiveFacetTagBundleTags = Record<AIFiveFacetTagCategory, string[]>;

export interface FiveFacetTagBundle {
  difficulty?: number;
  tags: Partial<Record<AIFiveFacetTagCategory | string, string[]>>;
}

export interface NormalizedFiveFacetTagBundle {
  difficulty?: number;
  tags: FiveFacetTagBundleTags;
}

export interface FiveFacetTagBundleValidationResult {
  errors: string[];
  normalized: NormalizedFiveFacetTagBundle;
  valid: boolean;
  warnings: string[];
}

export interface FiveFacetAliasResolution {
  alias: string;
  ambiguous: boolean;
  collision?: AIFiveFacetAliasCollision;
  normalizedAlias: string;
  nodes: AITagNode[];
  tagIds: string[];
}

export interface FiveFacetTagCatalogSummary {
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

export interface FiveFacetTagCatalog {
  aliasIndex: AIFiveFacetAliasIndex;
  childrenByTagId: ReadonlyMap<string, readonly AITagNode[]>;
  curriculumConceptMappings: ReadonlyMap<string, readonly string[]>;
  nodeByTagId: ReadonlyMap<string, AITagNode>;
  parentByTagId: ReadonlyMap<string, readonly AITagNode[]>;
  taxonomy: AIFiveFacetTagTaxonomy;
}

const BUNDLE_LIMITS: Record<
  AIFiveFacetTagCategory,
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

function isFiveFacetTagCategory(
  category: string,
): category is AIFiveFacetTagCategory {
  return FIVE_FACET_TAG_CATEGORIES.includes(
    category as AIFiveFacetTagCategory,
  );
}

function allTrees(taxonomy: AIFiveFacetTagTaxonomy): AITagTree[] {
  return FIVE_FACET_TAG_CATEGORIES.map((category) => taxonomy[category]);
}

function buildNodeByTagId(taxonomy: AIFiveFacetTagTaxonomy) {
  return new Map(
    allTrees(taxonomy)
      .flatMap((tree) => tree.nodes)
      .map((node) => [node.tagId, node] as const),
  );
}

function buildParentByTagId(
  nodeByTagId: ReadonlyMap<string, AITagNode>,
  taxonomy: AIFiveFacetTagTaxonomy,
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
  taxonomy: AIFiveFacetTagTaxonomy,
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

function buildCurriculumConceptMappingIndex(taxonomy: AIFiveFacetTagTaxonomy) {
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

function buildCatalog(): FiveFacetTagCatalog {
  const taxonomy = buildFiveFacetTagTaxonomy();
  const nodeByTagId = buildNodeByTagId(taxonomy);
  const parentByTagId = buildParentByTagId(nodeByTagId, taxonomy);
  const childrenByTagId = buildChildrenByTagId(nodeByTagId, taxonomy);
  const curriculumConceptMappings = buildCurriculumConceptMappingIndex(taxonomy);

  return {
    aliasIndex: buildFiveFacetAliasIndex(taxonomy),
    childrenByTagId,
    curriculumConceptMappings,
    nodeByTagId,
    parentByTagId,
    taxonomy,
  };
}

export const FIVE_FACET_TAG_CATALOG: FiveFacetTagCatalog = buildCatalog();

export function getFiveFacetTagCatalog() {
  return FIVE_FACET_TAG_CATALOG;
}

export function listFiveFacetTagCategories(): AIFiveFacetTagCategory[] {
  return [...FIVE_FACET_TAG_CATEGORIES];
}

export function listFiveFacetTagNodes(): AITagNode[] {
  return allTrees(FIVE_FACET_TAG_CATALOG.taxonomy).flatMap((tree) => [
    ...tree.nodes,
  ]);
}

export function listFiveFacetTagsByCategory(
  category: AIFiveFacetTagCategory,
): AITagNode[] {
  return [...FIVE_FACET_TAG_CATALOG.taxonomy[category].nodes];
}

export function getFiveFacetTagNode(tagId: string): AITagNode | null {
  return FIVE_FACET_TAG_CATALOG.nodeByTagId.get(tagId) ?? null;
}

export function getFiveFacetTagChildren(tagId: string): AITagNode[] {
  return [...(FIVE_FACET_TAG_CATALOG.childrenByTagId.get(tagId) ?? [])];
}

export function getFiveFacetTagParents(tagId: string): AITagNode[] {
  return [...(FIVE_FACET_TAG_CATALOG.parentByTagId.get(tagId) ?? [])];
}

export function getFiveFacetTagAncestors(tagId: string): AITagNode[] {
  const ancestors: AITagNode[] = [];
  const seen = new Set<string>();
  const visit = (currentTagId: string) => {
    for (const parent of getFiveFacetTagParents(currentTagId)) {
      if (seen.has(parent.tagId)) continue;
      seen.add(parent.tagId);
      ancestors.push(parent);
      visit(parent.tagId);
    }
  };
  visit(tagId);
  return ancestors;
}

export function getFiveFacetTagDescendants(tagId: string): AITagNode[] {
  const descendants: AITagNode[] = [];
  const seen = new Set<string>();
  const visit = (currentTagId: string) => {
    for (const child of getFiveFacetTagChildren(currentTagId)) {
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
    ...(FIVE_FACET_TAG_CATALOG.curriculumConceptMappings.get(
      curriculumTagId,
    ) ?? []),
  ]
    .map((tagId) => getFiveFacetTagNode(tagId))
    .filter((node): node is AITagNode => Boolean(node));
}

export function resolveFiveFacetAlias(
  aliasText: string,
): FiveFacetAliasResolution {
  const normalizedAlias = normalizeAlias(aliasText);
  const mapping = FIVE_FACET_TAG_CATALOG.aliasIndex.aliases.find(
    (candidate) => normalizeAlias(candidate.alias) === normalizedAlias,
  );
  const collision = FIVE_FACET_TAG_CATALOG.aliasIndex.collisions.find(
    (candidate) => normalizeAlias(candidate.alias) === normalizedAlias,
  );
  const tagIds = mapping?.tagIds ?? [];

  return {
    alias: aliasText,
    ambiguous: tagIds.length > 1,
    collision,
    normalizedAlias,
    nodes: tagIds
      .map((tagId) => getFiveFacetTagNode(tagId))
      .filter((node): node is AITagNode => Boolean(node)),
    tagIds,
  };
}

export function validateFiveFacetTagId(tagId: string): {
  category?: AIFiveFacetTagCategory;
  error?: string;
  node: AITagNode | null;
  valid: boolean;
} {
  const node = getFiveFacetTagNode(tagId);
  if (!node) {
    return {
      error: "unknown_five_facet_tag_id",
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

export function normalizeFiveFacetTagBundle(
  bundle: FiveFacetTagBundle,
): NormalizedFiveFacetTagBundle {
  const tags = Object.fromEntries(
    FIVE_FACET_TAG_CATEGORIES.map((category) => [
      category,
      Array.from(new Set((bundle.tags[category] ?? []).map((tag) => tag.trim()).filter(Boolean))),
    ]),
  ) as FiveFacetTagBundleTags;

  return {
    difficulty: typeof bundle.difficulty === "number" ? bundle.difficulty : undefined,
    tags,
  };
}

export function validateFiveFacetTagBundle(
  bundle: FiveFacetTagBundle,
): FiveFacetTagBundleValidationResult {
  const normalized = normalizeFiveFacetTagBundle(bundle);
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
    if (!isFiveFacetTagCategory(category)) {
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
  for (const category of FIVE_FACET_TAG_CATEGORIES) {
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
      const node = getFiveFacetTagNode(tagId);
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

export function summarizeFiveFacetTagCatalog(): FiveFacetTagCatalogSummary {
  const nodes = listFiveFacetTagNodes();
  const curriculumConceptMappingCount = Array.from(
    FIVE_FACET_TAG_CATALOG.curriculumConceptMappings.values(),
  ).reduce((count, mappings) => count + mappings.length, 0);

  return {
    aliasCollisionCount: FIVE_FACET_TAG_CATALOG.aliasIndex.collisions.length,
    categoryCount: FIVE_FACET_TAG_CATEGORIES.length,
    curriculumConceptMappingCount,
    difficultyIsTaxonomyCategory: false,
    errorPatternIsQuestionTaxonomy: false,
    noDbWrite: true,
    noProviderCall: true,
    noReviewDraftWrite: true,
    nodeCount: nodes.length,
  };
}
