import "server-only";

import { createRequire } from "node:module";

import type {
  AITaxonomyTagReviewActionDraft,
  AITaxonomyTagReviewActionPlan,
} from "@/lib/ai-pdf-import/taxonomy-tag-review-actions";
import type {
  AITaxonomyTagCategory,
  AITagEdge,
  AITagNode,
} from "@/lib/ai-pdf-import/taxonomy-tag-taxonomy";

const require = createRequire(import.meta.url);
const {
  buildTaxonomyQuestionTagAssignmentsFromApprovedActions,
  validateApprovedTaxonomyReviewAction,
} = require("./taxonomy-tag-assignment.ts") as typeof import("@/lib/tags/taxonomy-tag-assignment");
const {
  getTaxonomyTagCatalog,
  getTaxonomyTagNode,
  listTaxonomyTagCategories,
  listTaxonomyTagNodes,
  resolveTaxonomyAlias,
} = require("./taxonomy-tag-catalog.ts") as typeof import("@/lib/tags/taxonomy-tag-catalog");
const {
  validateTaxonomyQuestionTagAssignment,
  validateTaxonomyTagNodeRow,
} = require("./taxonomy-tag-persistence.ts") as typeof import("@/lib/tags/taxonomy-tag-persistence");
import type {
  TaxonomyQuestionTagAssignmentRow,
} from "@/lib/tags/taxonomy-tag-persistence";

type SupabaseLike = {
  from: (table: string) => {
    insert: (...args: never[]) => unknown;
    upsert: (...args: never[]) => unknown;
  };
};

type PersistableEdgeKind = "maps_to" | "parent_child" | "related";

export interface TaxonomyTagNodeSeedRow {
  category: AITaxonomyTagCategory;
  description: string;
  label: string;
  metadata: Record<string, unknown>;
  status: "active";
  tag_id: string;
}

export interface TaxonomyTagEdgeSeedRow {
  edge_kind: PersistableEdgeKind;
  from_tag_id: string;
  metadata: Record<string, unknown>;
  status: "active";
  to_tag_id: string;
}

export interface TaxonomyTagAliasSeedRow {
  alias_text: string;
  metadata: Record<string, unknown>;
  normalized_alias: string;
  status: "active" | "ambiguous";
  tag_id: string;
}

export interface TaxonomyCurriculumConceptMappingSeedRow {
  concept_tag_id: string;
  curriculum_tag_id: string;
  evidence: Record<string, unknown>;
  status: "active";
}

export interface TaxonomyCatalogSeedRows {
  aliases: TaxonomyTagAliasSeedRow[];
  curriculumConceptMappings: TaxonomyCurriculumConceptMappingSeedRow[];
  edges: TaxonomyTagEdgeSeedRow[];
  nodes: TaxonomyTagNodeSeedRow[];
  skippedEdges: AITagEdge[];
}

export interface TaxonomyCatalogSyncPlan {
  generatedAt: string;
  mode: "admin_server_only";
  safety: {
    noAiImportWrite: true;
    noExtractionBehaviorChange: true;
    noProviderCall: true;
    noReviewDraftWrite: true;
    serverOnly: true;
  };
  seedRows: TaxonomyCatalogSeedRows;
  status: "planned";
  upsertKeys: {
    aliases: ["normalized_alias", "tag_id"];
    curriculumConceptMappings: ["curriculum_tag_id", "concept_tag_id"];
    edges: ["from_tag_id", "to_tag_id", "edge_kind"];
    nodes: ["tag_id"];
  };
  validation: TaxonomyCatalogSeedValidation;
  version: "taxonomy_catalog_sync_plan_v1";
}

export interface TaxonomyCatalogSeedValidation {
  errors: string[];
  valid: boolean;
  warnings: string[];
}

export interface ApprovedTagAssignmentWritePlan {
  assignmentRows: TaxonomyQuestionTagAssignmentRow[];
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
  version: "taxonomy_approved_assignment_write_plan_v1";
  warnings: string[];
}

export interface TaxonomyReviewActionRowInput {
  action_id: string;
  action_kind: string;
  confidence: number | null;
  evidence: Record<string, unknown> | null;
  proposed_tag_ids: string[] | null;
  question_id: string | null;
  question_ref: Record<string, unknown> | null;
  reason: string | null;
  review_status: string;
  target_facet: string | null;
  target_tag_ids: string[] | null;
}

export interface TaxonomyAdminPersistenceSummary {
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isTaxonomyCategory(value: unknown): value is AITaxonomyTagCategory {
  return listTaxonomyTagCategories().includes(value as AITaxonomyTagCategory);
}

export function taxonomyReviewActionRowsToDrafts(
  rows: TaxonomyReviewActionRowInput[],
): AITaxonomyTagReviewActionDraft[] {
  return rows.map((row) => {
    const questionRef = asRecord(row.question_ref);
    const questionId =
      row.question_id ??
      (typeof questionRef.id === "string" ? questionRef.id : undefined);

    return {
      actionId: row.action_id,
      actionKind: row.action_kind as AITaxonomyTagReviewActionDraft["actionKind"],
      confidence: Number(row.confidence ?? 0),
      evidence: asRecord(row.evidence),
      proposedTagIds: stringList(row.proposed_tag_ids),
      questionRef: {
        ...questionRef,
        id: questionId,
      },
      reason: row.reason ?? "",
      reviewRequired: true,
      reviewStatus: row.review_status,
      safety: {
        noDbMutation: true,
        noOfficialTagWrite: true,
        noProviderCall: true,
        noReviewDraftWrite: true,
        planningOnly: true,
      },
      status: "pending_review",
      targetFacet: isTaxonomyCategory(row.target_facet) ? row.target_facet : null,
      targetTagIds: stringList(row.target_tag_ids),
    } as AITaxonomyTagReviewActionDraft & { reviewStatus: string };
  });
}

function catalogNodes(): AITagNode[] {
  return listTaxonomyTagNodes();
}

function catalogEdges(): AITagEdge[] {
  const catalog = getTaxonomyTagCatalog();
  return listTaxonomyTagCategories().flatMap((category) => [
    ...catalog.taxonomy[category].edges,
  ]);
}

function nodeToSeedRow(node: AITagNode): TaxonomyTagNodeSeedRow {
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

function edgeToSeedRow(edge: AITagEdge): TaxonomyTagEdgeSeedRow | null {
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

function catalogAliasRows(): TaxonomyTagAliasSeedRow[] {
  const catalog = getTaxonomyTagCatalog();
  return catalog.aliasIndex.aliases.flatMap((aliasMapping) => {
    const resolution = resolveTaxonomyAlias(aliasMapping.alias);
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

function curriculumConceptMappingRows(): TaxonomyCurriculumConceptMappingSeedRow[] {
  const catalog = getTaxonomyTagCatalog();
  const rows: TaxonomyCurriculumConceptMappingSeedRow[] = [];

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

export function buildTaxonomyCatalogSeedRows(): TaxonomyCatalogSeedRows {
  const nodes = catalogNodes().map(nodeToSeedRow);
  const edgeCandidates = catalogEdges();
  const edges = edgeCandidates
    .map(edgeToSeedRow)
    .filter((edge): edge is TaxonomyTagEdgeSeedRow => Boolean(edge));
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

export function validateTaxonomyCatalogSeedRows(
  seedRows: TaxonomyCatalogSeedRows,
): TaxonomyCatalogSeedValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tagIds = new Set(seedRows.nodes.map((node) => node.tag_id));

  for (const node of seedRows.nodes) {
    const validation = validateTaxonomyTagNodeRow(node);
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

export function buildTaxonomyCatalogSyncPlan({
  generatedAt = new Date().toISOString(),
}: { generatedAt?: string } = {}): TaxonomyCatalogSyncPlan {
  const seedRows = buildTaxonomyCatalogSeedRows();
  const validation = validateTaxonomyCatalogSeedRows(seedRows);

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
    version: "taxonomy_catalog_sync_plan_v1",
  };
}

function approvedActions(
  input: AITaxonomyTagReviewActionDraft[] | AITaxonomyTagReviewActionPlan,
) {
  const actions = Array.isArray(input) ? input : input.actions;
  return actions.filter((action) => validateApprovedTaxonomyReviewAction(action).valid);
}

export function buildApprovedTagAssignmentWritePlan(
  input: AITaxonomyTagReviewActionDraft[] | AITaxonomyTagReviewActionPlan,
  { generatedAt = new Date().toISOString() }: { generatedAt?: string } = {},
): ApprovedTagAssignmentWritePlan {
  const assignmentResult =
    buildTaxonomyQuestionTagAssignmentsFromApprovedActions(input);
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
    version: "taxonomy_approved_assignment_write_plan_v1",
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

export function buildApprovedTagAssignmentWritePlanFromRows(
  rows: TaxonomyReviewActionRowInput[],
  options: { generatedAt?: string } = {},
) {
  return buildApprovedTagAssignmentWritePlan(
    taxonomyReviewActionRowsToDrafts(rows),
    options,
  );
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
    const validation = validateTaxonomyQuestionTagAssignment({
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
    const node = getTaxonomyTagNode(row.tag_id);
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

export function summarizeTaxonomyAdminPersistencePlan({
  assignmentWritePlan,
  catalogSyncPlan,
}: {
  assignmentWritePlan?: ApprovedTagAssignmentWritePlan;
  catalogSyncPlan: TaxonomyCatalogSyncPlan;
}): TaxonomyAdminPersistenceSummary {
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

export async function seedTaxonomyCatalog({
  createdBy,
  supabase,
}: {
  createdBy?: string;
  supabase: SupabaseLike;
}) {
  const plan = buildTaxonomyCatalogSyncPlan();
  const validation = validateTaxonomyCatalogSeedRows(plan.seedRows);
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

  const upsertRows = supabase.from("taxonomy_nodes").upsert as (
    values: unknown,
    options?: unknown,
  ) => PromiseLike<unknown>;
  await upsertRows(nodeRows, {
    onConflict: "tag_id",
  });
  await (supabase.from("taxonomy_edges").upsert as (
    values: unknown,
    options?: unknown,
  ) => PromiseLike<unknown>)(edgeRows, {
    onConflict: "from_tag_id,to_tag_id,edge_kind",
  });
  await (supabase.from("taxonomy_aliases").upsert as (
    values: unknown,
    options?: unknown,
  ) => PromiseLike<unknown>)(aliasRows, {
    onConflict: "normalized_alias,tag_id",
  });
  await (supabase.from("taxonomy_edges").upsert as (
    values: unknown,
    options?: unknown,
  ) => PromiseLike<unknown>)(mappingRows, {
      onConflict: "curriculum_tag_id,concept_tag_id",
    });

  return { plan };
}

export async function persistApprovedTaxonomyAssignments({
  createdBy,
  reviewActions,
  supabase,
}: {
  createdBy?: string;
  reviewActions: AITaxonomyTagReviewActionDraft[] | AITaxonomyTagReviewActionPlan;
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
    await (supabase.from("question_taxonomy_assignments").insert as (
      values: unknown,
    ) => PromiseLike<unknown>)(rows);
  }

  return { plan };
}
