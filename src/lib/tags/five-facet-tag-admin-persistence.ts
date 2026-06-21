import "server-only";

import { createRequire } from "node:module";

import type {
  AIFiveFacetTagReviewActionDraft,
  AIFiveFacetTagReviewActionPlan,
} from "@/lib/ai-pdf-import/five-facet-tag-review-actions";
import type {
  AIFiveFacetTagCategory,
  AITagEdge,
  AITagNode,
} from "@/lib/ai-pdf-import/five-facet-tag-taxonomy";

const require = createRequire(import.meta.url);
const {
  buildFiveFacetQuestionTagAssignmentsFromApprovedActions,
  validateApprovedFiveFacetReviewAction,
} = require("./five-facet-tag-assignment.ts") as typeof import("@/lib/tags/five-facet-tag-assignment");
const {
  getFiveFacetTagCatalog,
  getFiveFacetTagNode,
  listFiveFacetTagCategories,
  listFiveFacetTagNodes,
  resolveFiveFacetAlias,
} = require("./five-facet-tag-catalog.ts") as typeof import("@/lib/tags/five-facet-tag-catalog");
const {
  validateFiveFacetQuestionTagAssignment,
  validateFiveFacetTagNodeRow,
} = require("./five-facet-tag-persistence.ts") as typeof import("@/lib/tags/five-facet-tag-persistence");
import type {
  FiveFacetQuestionTagAssignmentRow,
} from "@/lib/tags/five-facet-tag-persistence";

type SupabaseLike = {
  from: (table: string) => {
    insert: (values: unknown) => unknown;
    upsert: (values: unknown, options?: unknown) => unknown;
  };
};

type PersistableEdgeKind = "maps_to" | "parent_child" | "related";

export interface FiveFacetTagNodeSeedRow {
  category: AIFiveFacetTagCategory;
  description: string;
  label: string;
  metadata: Record<string, unknown>;
  status: "active";
  tag_id: string;
}

export interface FiveFacetTagEdgeSeedRow {
  edge_kind: PersistableEdgeKind;
  from_tag_id: string;
  metadata: Record<string, unknown>;
  status: "active";
  to_tag_id: string;
}

export interface FiveFacetTagAliasSeedRow {
  alias_text: string;
  metadata: Record<string, unknown>;
  normalized_alias: string;
  status: "active" | "ambiguous";
  tag_id: string;
}

export interface FiveFacetCurriculumConceptMappingSeedRow {
  concept_tag_id: string;
  curriculum_tag_id: string;
  evidence: Record<string, unknown>;
  status: "active";
}

export interface FiveFacetCatalogSeedRows {
  aliases: FiveFacetTagAliasSeedRow[];
  curriculumConceptMappings: FiveFacetCurriculumConceptMappingSeedRow[];
  edges: FiveFacetTagEdgeSeedRow[];
  nodes: FiveFacetTagNodeSeedRow[];
  skippedEdges: AITagEdge[];
}

export interface FiveFacetCatalogSyncPlan {
  generatedAt: string;
  mode: "admin_server_only";
  safety: {
    noAiImportWrite: true;
    noExtractionBehaviorChange: true;
    noProviderCall: true;
    noReviewDraftWrite: true;
    serverOnly: true;
  };
  seedRows: FiveFacetCatalogSeedRows;
  status: "planned";
  upsertKeys: {
    aliases: ["normalized_alias", "tag_id"];
    curriculumConceptMappings: ["curriculum_tag_id", "concept_tag_id"];
    edges: ["from_tag_id", "to_tag_id", "edge_kind"];
    nodes: ["tag_id"];
  };
  validation: FiveFacetCatalogSeedValidation;
  version: "five_facet_catalog_sync_plan_v1";
}

export interface FiveFacetCatalogSeedValidation {
  errors: string[];
  valid: boolean;
  warnings: string[];
}

export interface ApprovedTagAssignmentWritePlan {
  assignmentRows: FiveFacetQuestionTagAssignmentRow[];
  errors: string[];
  generatedAt: string;
  mode: "admin_server_only";
  safety: {
    noAiImportWrite: true;
    noExtractionBehaviorChange: true;
    noProviderCall: true;
    noReviewDraftWrite: true;
    serverOnly: true;
  };
  sourceActionIds: string[];
  status: "blocked" | "planned";
  valid: boolean;
  version: "five_facet_approved_assignment_write_plan_v1";
  warnings: string[];
}

export interface FiveFacetAdminPersistenceSummary {
  aliasCount: number;
  assignmentRowCount: number;
  curriculumConceptMappingCount: number;
  edgeCount: number;
  nodeCount: number;
  noAiImportWrite: true;
  noExtractionBehaviorChange: true;
  noProviderCall: true;
  noReviewDraftWrite: true;
  serverOnly: true;
}

const PERSISTABLE_EDGE_KINDS = new Set<string>([
  "maps_to",
  "parent_child",
  "related",
]);

function normalizedAlias(alias: string) {
  return alias.trim().toLowerCase().replace(/\s+/g, " ");
}

function uniqueBy<T>(values: T[], keyFor: (value: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const key = keyFor(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function catalogNodes(): AITagNode[] {
  return listFiveFacetTagNodes();
}

function catalogEdges(): AITagEdge[] {
  const catalog = getFiveFacetTagCatalog();
  return listFiveFacetTagCategories().flatMap((category) => [
    ...catalog.taxonomy[category].edges,
  ]);
}

function nodeToSeedRow(node: AITagNode): FiveFacetTagNodeSeedRow {
  return {
    category: node.category,
    description: node.description,
    label: node.label,
    metadata: {
      exampleSignals: node.exampleSignals,
      parentTagIds: node.parentTagIds,
      source: node.source,
    },
    status: "active",
    tag_id: node.tagId,
  };
}

function edgeToSeedRow(edge: AITagEdge): FiveFacetTagEdgeSeedRow | null {
  if (!PERSISTABLE_EDGE_KINDS.has(edge.edgeKind)) {
    return null;
  }

  return {
    edge_kind: edge.edgeKind as PersistableEdgeKind,
    from_tag_id: edge.fromTagId,
    metadata: { sourceEdgeId: edge.edgeId },
    status: "active",
    to_tag_id: edge.toTagId,
  };
}

function catalogAliasRows(): FiveFacetTagAliasSeedRow[] {
  const catalog = getFiveFacetTagCatalog();
  return catalog.aliasIndex.aliases.flatMap((aliasMapping) => {
    const resolution = resolveFiveFacetAlias(aliasMapping.alias);
    return aliasMapping.tagIds.map((tagId) => ({
      alias_text: aliasMapping.alias,
      metadata: {
        candidateTagIds: resolution.tagIds,
        source: "built_in_seed",
      },
      normalized_alias: normalizedAlias(aliasMapping.alias),
      status: resolution.ambiguous ? "ambiguous" : "active",
      tag_id: tagId,
    }));
  });
}

function curriculumConceptMappingRows(): FiveFacetCurriculumConceptMappingSeedRow[] {
  const catalog = getFiveFacetTagCatalog();
  const rows: FiveFacetCurriculumConceptMappingSeedRow[] = [];

  for (const [curriculumTagId, conceptTagIds] of catalog.curriculumConceptMappings) {
    for (const conceptTagId of conceptTagIds) {
      rows.push({
        concept_tag_id: conceptTagId,
        curriculum_tag_id: curriculumTagId,
        evidence: {
          hierarchyMutation: false,
          source: "built_in_seed",
        },
        status: "active",
      });
    }
  }

  return rows;
}

export function buildFiveFacetCatalogSeedRows(): FiveFacetCatalogSeedRows {
  const nodes = catalogNodes().map(nodeToSeedRow);
  const edgeCandidates = catalogEdges();
  const edges = edgeCandidates
    .map(edgeToSeedRow)
    .filter((edge): edge is FiveFacetTagEdgeSeedRow => Boolean(edge));
  const skippedEdges = edgeCandidates.filter((edge) => !edgeToSeedRow(edge));
  const aliases = catalogAliasRows();
  const curriculumConceptMappings = curriculumConceptMappingRows();

  return {
    aliases: uniqueBy(aliases, (alias) => `${alias.normalized_alias}:${alias.tag_id}`),
    curriculumConceptMappings: uniqueBy(
      curriculumConceptMappings,
      (mapping) => `${mapping.curriculum_tag_id}:${mapping.concept_tag_id}`,
    ),
    edges: uniqueBy(
      edges,
      (edge) => `${edge.from_tag_id}:${edge.to_tag_id}:${edge.edge_kind}`,
    ),
    nodes: uniqueBy(nodes, (node) => node.tag_id),
    skippedEdges,
  };
}

export function validateFiveFacetCatalogSeedRows(
  seedRows: FiveFacetCatalogSeedRows,
): FiveFacetCatalogSeedValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tagIds = new Set(seedRows.nodes.map((node) => node.tag_id));

  for (const node of seedRows.nodes) {
    const validation = validateFiveFacetTagNodeRow(node);
    errors.push(...validation.errors);
    if (/^difficulty(\.|$)/.test(node.tag_id)) {
      errors.push("difficulty_is_not_taxonomy");
    }
    if (/^error_pattern(\.|$)/.test(node.tag_id)) {
      errors.push("error_pattern_is_not_question_taxonomy");
    }
  }

  for (const edge of seedRows.edges) {
    if (!tagIds.has(edge.from_tag_id)) {
      errors.push(`edge_missing_from_tag:${edge.from_tag_id}`);
    }
    if (!tagIds.has(edge.to_tag_id)) {
      errors.push(`edge_missing_to_tag:${edge.to_tag_id}`);
    }
    if (!PERSISTABLE_EDGE_KINDS.has(edge.edge_kind)) {
      errors.push(`edge_kind_not_persistable:${edge.edge_kind}`);
    }
  }

  for (const alias of seedRows.aliases) {
    if (!tagIds.has(alias.tag_id)) {
      errors.push(`alias_unknown_tag:${alias.tag_id}`);
    }
    if (!alias.normalized_alias.trim()) {
      errors.push("alias_missing_normalized_alias");
    }
  }

  for (const mapping of seedRows.curriculumConceptMappings) {
    if (!mapping.curriculum_tag_id.startsWith("curriculum.")) {
      errors.push(`mapping_from_not_curriculum:${mapping.curriculum_tag_id}`);
    }
    if (!mapping.concept_tag_id.startsWith("concept.")) {
      errors.push(`mapping_to_not_concept:${mapping.concept_tag_id}`);
    }
    if (!tagIds.has(mapping.curriculum_tag_id)) {
      errors.push(`mapping_unknown_curriculum:${mapping.curriculum_tag_id}`);
    }
    if (!tagIds.has(mapping.concept_tag_id)) {
      errors.push(`mapping_unknown_concept:${mapping.concept_tag_id}`);
    }
  }

  if (seedRows.skippedEdges.length) {
    warnings.push(`skipped_non_persistable_edges:${seedRows.skippedEdges.length}`);
  }

  return {
    errors,
    valid: errors.length === 0,
    warnings,
  };
}

export function buildFiveFacetCatalogSyncPlan({
  generatedAt = new Date().toISOString(),
}: { generatedAt?: string } = {}): FiveFacetCatalogSyncPlan {
  const seedRows = buildFiveFacetCatalogSeedRows();
  const validation = validateFiveFacetCatalogSeedRows(seedRows);

  return {
    generatedAt,
    mode: "admin_server_only",
    safety: {
      noAiImportWrite: true,
      noExtractionBehaviorChange: true,
      noProviderCall: true,
      noReviewDraftWrite: true,
      serverOnly: true,
    },
    seedRows,
    status: "planned",
    upsertKeys: {
      aliases: ["normalized_alias", "tag_id"],
      curriculumConceptMappings: ["curriculum_tag_id", "concept_tag_id"],
      edges: ["from_tag_id", "to_tag_id", "edge_kind"],
      nodes: ["tag_id"],
    },
    validation,
    version: "five_facet_catalog_sync_plan_v1",
  };
}

function approvedActions(
  input: AIFiveFacetTagReviewActionDraft[] | AIFiveFacetTagReviewActionPlan,
) {
  const actions = Array.isArray(input) ? input : input.actions;
  return actions.filter((action) => validateApprovedFiveFacetReviewAction(action).valid);
}

export function buildApprovedTagAssignmentWritePlan(
  input: AIFiveFacetTagReviewActionDraft[] | AIFiveFacetTagReviewActionPlan,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): ApprovedTagAssignmentWritePlan {
  const assignmentResult =
    buildFiveFacetQuestionTagAssignmentsFromApprovedActions(input);
  const validation = validateApprovedTagAssignmentWritePlan({
    assignmentRows: assignmentResult.rows,
    errors: assignmentResult.errors,
    generatedAt,
    mode: "admin_server_only",
    safety: {
      noAiImportWrite: true,
      noExtractionBehaviorChange: true,
      noProviderCall: true,
      noReviewDraftWrite: true,
      serverOnly: true,
    },
    sourceActionIds: approvedActions(input).map((action) => action.actionId),
    status: assignmentResult.errors.length ? "blocked" : "planned",
    valid: assignmentResult.errors.length === 0,
    version: "five_facet_approved_assignment_write_plan_v1",
    warnings: assignmentResult.warnings,
  });

  return {
    ...validation.plan,
    errors: [...validation.plan.errors, ...validation.errors],
    status: validation.valid && validation.plan.errors.length === 0 ? "planned" : "blocked",
    valid: validation.valid && validation.plan.errors.length === 0,
    warnings: [...validation.plan.warnings, ...validation.warnings],
  };
}

export function validateApprovedTagAssignmentWritePlan(plan: ApprovedTagAssignmentWritePlan) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (plan.mode !== "admin_server_only") {
    errors.push("write_plan_must_be_admin_server_only");
  }
  if (!plan.safety.serverOnly) {
    errors.push("write_plan_missing_server_only_safety");
  }
  if (!plan.safety.noAiImportWrite) {
    errors.push("write_plan_must_not_be_ai_import_write");
  }
  if (!plan.safety.noProviderCall) {
    errors.push("write_plan_must_not_call_provider");
  }
  if (!plan.safety.noReviewDraftWrite) {
    errors.push("write_plan_must_not_write_review_drafts");
  }
  if (!plan.safety.noExtractionBehaviorChange) {
    errors.push("write_plan_must_not_change_extraction");
  }

  for (const row of plan.assignmentRows) {
    const validation = validateFiveFacetQuestionTagAssignment({
      category: row.category,
      confidence: row.confidence,
      evidence: row.evidence,
      question_id: row.question_id,
      review_status: row.review_status,
      source: row.source,
      tag_id: row.tag_id,
    });
    errors.push(...validation.errors);
    warnings.push(...validation.warnings);

    if (row.review_status !== "approved") {
      errors.push(`assignment_not_approved:${row.question_id}:${row.tag_id}`);
    }
    const node = getFiveFacetTagNode(row.tag_id);
    if (!node) {
      errors.push(`assignment_unknown_catalog_tag:${row.tag_id}`);
    } else if (node.category !== row.category) {
      errors.push(`assignment_wrong_category:${row.tag_id}:expected_${row.category}`);
    }
  }

  return {
    errors,
    plan,
    valid: errors.length === 0,
    warnings,
  };
}

export function summarizeFiveFacetAdminPersistencePlan({
  assignmentWritePlan,
  catalogSyncPlan,
}: {
  assignmentWritePlan?: ApprovedTagAssignmentWritePlan;
  catalogSyncPlan: FiveFacetCatalogSyncPlan;
}): FiveFacetAdminPersistenceSummary {
  return {
    aliasCount: catalogSyncPlan.seedRows.aliases.length,
    assignmentRowCount: assignmentWritePlan?.assignmentRows.length ?? 0,
    curriculumConceptMappingCount:
      catalogSyncPlan.seedRows.curriculumConceptMappings.length,
    edgeCount: catalogSyncPlan.seedRows.edges.length,
    nodeCount: catalogSyncPlan.seedRows.nodes.length,
    noAiImportWrite: catalogSyncPlan.safety.noAiImportWrite,
    noExtractionBehaviorChange: catalogSyncPlan.safety.noExtractionBehaviorChange,
    noProviderCall: catalogSyncPlan.safety.noProviderCall,
    noReviewDraftWrite: catalogSyncPlan.safety.noReviewDraftWrite,
    serverOnly: catalogSyncPlan.safety.serverOnly,
  };
}

export async function seedFiveFacetCatalog({
  createdBy,
  supabase,
}: {
  createdBy?: string;
  supabase: SupabaseLike;
}) {
  const plan = buildFiveFacetCatalogSyncPlan();
  const validation = validateFiveFacetCatalogSeedRows(plan.seedRows);
  if (!validation.valid) {
    return { error: validation.errors.join("; "), plan };
  }

  const nodeRows = plan.seedRows.nodes.map((row) => ({
    ...row,
    created_by: createdBy,
    updated_by: createdBy,
  }));
  const edgeRows = plan.seedRows.edges.map((row) => ({
    ...row,
    created_by: createdBy,
    updated_by: createdBy,
  }));
  const aliasRows = plan.seedRows.aliases.map((row) => ({
    ...row,
    created_by: createdBy,
    updated_by: createdBy,
  }));
  const mappingRows = plan.seedRows.curriculumConceptMappings.map((row) => ({
    ...row,
    created_by: createdBy,
    updated_by: createdBy,
  }));

  await (supabase.from("five_facet_tag_nodes").upsert(nodeRows, {
    onConflict: "tag_id",
  }) as PromiseLike<unknown>);
  await (supabase.from("five_facet_tag_edges").upsert(edgeRows, {
    onConflict: "from_tag_id,to_tag_id,edge_kind",
  }) as PromiseLike<unknown>);
  await (supabase.from("five_facet_tag_aliases").upsert(aliasRows, {
    onConflict: "normalized_alias,tag_id",
  }) as PromiseLike<unknown>);
  await (supabase
    .from("five_facet_curriculum_concept_mappings")
    .upsert(mappingRows, {
      onConflict: "curriculum_tag_id,concept_tag_id",
    }) as PromiseLike<unknown>);

  return { plan };
}

export async function persistApprovedFiveFacetAssignments({
  createdBy,
  reviewActions,
  supabase,
}: {
  createdBy?: string;
  reviewActions: AIFiveFacetTagReviewActionDraft[] | AIFiveFacetTagReviewActionPlan;
  supabase: SupabaseLike;
}) {
  const plan = buildApprovedTagAssignmentWritePlan(reviewActions);
  if (!plan.valid) {
    return { error: plan.errors.join("; "), plan };
  }

  const rows = plan.assignmentRows.map((row) => ({
    ...row,
    created_by: createdBy,
    updated_by: createdBy,
  }));

  if (rows.length) {
    await (supabase
      .from("five_facet_question_tag_assignments")
      .insert(rows) as PromiseLike<unknown>);
  }

  return { plan };
}
