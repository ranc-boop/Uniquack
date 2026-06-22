export type AITaxonomyPersistencePlanVersion =
  "taxonomy_persistence_plan_v1";

export type AITaxonomyPersistencePlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

export type AITaxonomyPersistenceMode = "planning_only";

export type AITaxonomyVisibility = "private" | "school" | "public" | "system";

export type AITaxonomyPackStatus =
  | "draft"
  | "active"
  | "archived"
  | "deprecated";

export type AITaxonomyOfficialTagStatus =
  | "active"
  | "deprecated"
  | "merged"
  | "archived";

export type AITaxonomyAdminOperationKind =
  | "create_pack"
  | "update_tag"
  | "deprecate_tag"
  | "merge_alias"
  | "move_parent"
  | "approve_review_action"
  | "reject_review_action"
  | "publish_pack_version"
  | "rollback_pack_version";

export interface AITaxonomyPersistencePlan {
  generatedAt: string;
  mode: AITaxonomyPersistenceMode;
  proposedAdminContracts: AITaxonomyAdminContract[];
  proposedAuditPlan: AITaxonomyAuditPlan;
  proposedMigrationPlan: AITaxonomyMigrationPlanProposal;
  proposedStorageModel: AITaxonomyStorageModelProposal;
  proposedVersioningPlan: AITaxonomyVersioningPlan;
  sourcePlans: {
    taggingV2PlanPresent: boolean;
    taxonomyBootstrapPlanPresent: boolean;
    taxonomyReviewPlanPresent: boolean;
  };
  stats: AITaxonomyPersistencePlanStats;
  status: AITaxonomyPersistencePlanStatus;
  taxonomyVersion: "edu_taxonomy_v1";
  validation: AITaxonomyPersistenceValidation;
  version: AITaxonomyPersistencePlanVersion;
  warnings: string[];
}

export interface AITaxonomyStorageModelProposal {
  indexes: AITaxonomyProposedIndex[];
  mode: "proposal_only";
  noMigrationAdded: true;
  relationships: AITaxonomyProposedRelationship[];
  rlsNotes: string[];
  tables: AITaxonomyProposedTable[];
}

export interface AITaxonomyProposedTable {
  proposedColumns: AITaxonomyProposedColumn[];
  purpose: string;
  requiredForPhase:
    | "official_taxonomy_storage"
    | "alias_mapping"
    | "hierarchy"
    | "review_workflow"
    | "versioning"
    | "future_question_assignment";
  tableName:
    | "taxonomy_packs"
    | "taxonomy_tags"
    | "taxonomy_aliases"
    | "taxonomy_edges"
    | "taxonomy_review_actions"
    | "taxonomy_pack_versions"
    | "question_tag_assignments";
  writePolicy:
    | "admin_only"
    | "teacher_private_only"
    | "system_only"
    | "future_design";
}

export interface AITaxonomyProposedColumn {
  name: string;
  nullable: boolean;
  purpose: string;
  sensitive: boolean;
  type: string;
}

export interface AITaxonomyProposedRelationship {
  fromColumn: string;
  fromTable: string;
  relationshipKind:
    | "belongs_to_pack"
    | "parent_child"
    | "alias_of"
    | "review_targets"
    | "version_of"
    | "question_assignment";
  required: boolean;
  toColumn: string;
  toTable: string;
}

export interface AITaxonomyProposedIndex {
  columns: string[];
  purpose: string;
  tableName: string;
  unique: boolean;
}

export interface AITaxonomyAdminContract {
  allowedRoles: Array<
    "super_admin" | "admin" | "teacher" | "curriculum_reviewer"
  >;
  description: string;
  implementedNow: false;
  inputShape: AITaxonomyAdminInputField[];
  label: string;
  operationKind: AITaxonomyAdminOperationKind;
  producesAuditEvent: true;
  safetyRules: string[];
  validationRules: string[];
}

export interface AITaxonomyAdminInputField {
  description: string;
  name: string;
  required: boolean;
  type: string;
}

export interface AITaxonomyMigrationPlanProposal {
  mode: "proposal_only";
  noMigrationAdded: true;
  phases: AITaxonomyMigrationPhase[];
  recommendedFirstMigration: string;
  risks: string[];
}

export interface AITaxonomyMigrationPhase {
  blockedUntil: string[];
  description: string;
  label: string;
  phaseId: string;
  proposedTables: string[];
  safeToImplementLater: boolean;
}

export interface AITaxonomyVersioningPlan {
  aliasChangeStrategy: "append_only_audit";
  deprecationStrategy: "soft_deprecate_do_not_delete";
  notes: string[];
  packVersionStrategy: "immutable_pack_versions";
  rollbackStrategy: "activate_previous_pack_version";
  tagIdStability: "stable_official_ids";
}

export interface AITaxonomyAuditPlan {
  auditEvents: AITaxonomyAuditEventProposal[];
  requiredFields: string[];
  retentionNotes: string[];
}

export interface AITaxonomyAuditEventProposal {
  actorRequired: true;
  beforeAfterRequired: boolean;
  eventKind:
    | "tag_created"
    | "tag_updated"
    | "tag_deprecated"
    | "alias_added"
    | "parent_changed"
    | "review_action_approved"
    | "review_action_rejected"
    | "pack_published"
    | "pack_rolled_back";
  reasonRequired: boolean;
}

export interface AITaxonomyPersistenceValidation {
  adminContractsRequireRoles: boolean;
  auditRequiredForMutations: boolean;
  errors: string[];
  noDbMutation: true;
  noMigrationAdded: true;
  noOfficialPromotion: true;
  softDeleteOrDeprecationOnly: boolean;
  sourceReviewPlanPresent: boolean;
  valid: boolean;
  warnings: string[];
}

export interface AITaxonomyPersistencePlanStats {
  adminContractCount: number;
  auditEventCount: number;
  migrationPhaseCount: number;
  proposedIndexCount: number;
  proposedRelationshipCount: number;
  proposedTableCount: number;
  warningCount: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function column(
  name: string,
  type: string,
  nullable: boolean,
  purpose: string,
  sensitive = false,
): AITaxonomyProposedColumn {
  return { name, nullable, purpose, sensitive, type };
}

function field(
  name: string,
  type: string,
  required: boolean,
  description: string,
): AITaxonomyAdminInputField {
  return { description, name, required, type };
}

export function buildTaxonomyStorageModelProposal(): AITaxonomyStorageModelProposal {
  const tables: AITaxonomyProposedTable[] = [
    {
      proposedColumns: [
        column("id", "uuid", false, "Primary key."),
        column("id_path", "text", false, "Stable pack ID path."),
        column("label", "text", false, "Human-readable pack name."),
        column("kind", "text", false, "Pack family such as SAT Math or AP Physics."),
        column("visibility", "taxonomy_visibility", false, "Private, school, public, or system scope."),
        column("status", "taxonomy_pack_status", false, "Draft, active, archived, or deprecated."),
        column("created_by", "uuid", true, "Author or owner profile."),
        column("created_at", "timestamptz", false, "Creation timestamp."),
        column("updated_at", "timestamptz", false, "Update timestamp."),
      ],
      purpose: "Owns official taxonomy packs such as SAT Math v1, AP Physics 1 v1, teacher private packs, and future school/public packs.",
      requiredForPhase: "official_taxonomy_storage",
      tableName: "taxonomy_packs",
      writePolicy: "admin_only",
    },
    {
      proposedColumns: [
        column("id", "uuid", false, "Primary key."),
        column("pack_id", "uuid", false, "Owning taxonomy pack."),
        column("official_tag_id", "text", false, "Stable official tag identifier."),
        column("label", "text", false, "Official tag label."),
        column("level", "text", false, "Topic hierarchy level."),
        column("description", "text", true, "Reviewer-approved definition."),
        column("status", "taxonomy_official_tag_status", false, "Active, deprecated, merged, or archived."),
        column("created_by", "uuid", true, "Admin or reviewer who created it."),
        column("created_at", "timestamptz", false, "Creation timestamp."),
        column("updated_at", "timestamptz", false, "Update timestamp."),
        column("deprecated_at", "timestamptz", true, "Soft-deprecation timestamp."),
      ],
      purpose: "Stores official controlled taxonomy tags after human approval.",
      requiredForPhase: "official_taxonomy_storage",
      tableName: "taxonomy_tags",
      writePolicy: "admin_only",
    },
    {
      proposedColumns: [
        column("id", "uuid", false, "Primary key."),
        column("tag_id", "uuid", false, "Official tag receiving the alias."),
        column("alias_text", "text", false, "Synonym or near-synonym text."),
        column("alias_kind", "text", false, "Synonym, abbreviation, typo, or related phrase."),
        column("confidence", "numeric", true, "Optional review confidence."),
        column("created_by", "uuid", true, "Reviewer who added it."),
        column("created_at", "timestamptz", false, "Creation timestamp."),
      ],
      purpose: "Stores synonyms, near synonyms, and search aliases for official tags.",
      requiredForPhase: "alias_mapping",
      tableName: "taxonomy_aliases",
      writePolicy: "admin_only",
    },
    {
      proposedColumns: [
        column("id", "uuid", false, "Primary key."),
        column("parent_tag_id", "uuid", false, "Broader or prerequisite tag."),
        column("child_tag_id", "uuid", false, "Narrower or dependent tag."),
        column("edge_kind", "text", false, "Hierarchy, prerequisite, or related relationship."),
        column("created_at", "timestamptz", false, "Creation timestamp."),
      ],
      purpose: "Stores parent-child hierarchy and future broader/narrower relationships.",
      requiredForPhase: "hierarchy",
      tableName: "taxonomy_edges",
      writePolicy: "admin_only",
    },
    {
      proposedColumns: [
        column("id", "uuid", false, "Primary key."),
        column("action_type", "text", false, "Review action kind."),
        column("target_type", "text", false, "Target object type."),
        column("target_id", "text", false, "Stable target ID from review plan."),
        column("status", "text", false, "Pending, approved, rejected, or executed."),
        column("proposed_change_json", "jsonb", false, "Bounded proposed change payload."),
        column("reviewer_id", "uuid", true, "Reviewer profile."),
        column("reviewed_at", "timestamptz", true, "Review timestamp."),
        column("reason", "text", true, "Human review reason."),
        column("audit_event_id", "uuid", true, "Linked audit event."),
      ],
      purpose: "Persists human review actions derived from taxonomyReviewPlan.",
      requiredForPhase: "review_workflow",
      tableName: "taxonomy_review_actions",
      writePolicy: "admin_only",
    },
    {
      proposedColumns: [
        column("id", "uuid", false, "Primary key."),
        column("pack_id", "uuid", false, "Owning taxonomy pack."),
        column("version_label", "text", false, "Immutable version label."),
        column("snapshot_json", "jsonb", false, "Bounded approved taxonomy snapshot."),
        column("published_by", "uuid", true, "Publishing reviewer."),
        column("published_at", "timestamptz", true, "Publish timestamp."),
        column("rollback_of_version_id", "uuid", true, "Rollback source version."),
      ],
      purpose: "Stores immutable version snapshots for rollback and curriculum stability.",
      requiredForPhase: "versioning",
      tableName: "taxonomy_pack_versions",
      writePolicy: "admin_only",
    },
    {
      proposedColumns: [
        column("id", "uuid", false, "Primary key."),
        column("question_id", "uuid", false, "Question receiving a future official assignment."),
        column("tag_id", "uuid", false, "Official taxonomy tag."),
        column("source", "text", false, "Human, AI-assisted, or import source."),
        column("confidence", "numeric", true, "Optional assignment confidence."),
        column("reviewed_by", "uuid", true, "Reviewer profile."),
        column("created_at", "timestamptz", false, "Creation timestamp."),
      ],
      purpose: "Future official question-to-tag assignment table. Proposal only.",
      requiredForPhase: "future_question_assignment",
      tableName: "question_tag_assignments",
      writePolicy: "future_design",
    },
  ];

  return {
    indexes: [
      { columns: ["id_path"], purpose: "Keep taxonomy pack ID paths unique.", tableName: "taxonomy_packs", unique: true },
      { columns: ["pack_id", "official_tag_id"], purpose: "Keep official IDs stable within a pack.", tableName: "taxonomy_tags", unique: true },
      { columns: ["tag_id", "alias_text"], purpose: "Avoid duplicate aliases for a tag.", tableName: "taxonomy_aliases", unique: true },
      { columns: ["parent_tag_id", "child_tag_id", "edge_kind"], purpose: "Avoid duplicate hierarchy edges.", tableName: "taxonomy_edges", unique: true },
      { columns: ["target_type", "target_id", "status"], purpose: "Find pending review actions by target.", tableName: "taxonomy_review_actions", unique: false },
      { columns: ["pack_id", "version_label"], purpose: "Keep pack version labels unique.", tableName: "taxonomy_pack_versions", unique: true },
      { columns: ["question_id", "tag_id"], purpose: "Avoid duplicate future official question assignments.", tableName: "question_tag_assignments", unique: true },
    ],
    mode: "proposal_only",
    noMigrationAdded: true,
    relationships: [
      { fromColumn: "pack_id", fromTable: "taxonomy_tags", relationshipKind: "belongs_to_pack", required: true, toColumn: "id", toTable: "taxonomy_packs" },
      { fromColumn: "tag_id", fromTable: "taxonomy_aliases", relationshipKind: "alias_of", required: true, toColumn: "id", toTable: "taxonomy_tags" },
      { fromColumn: "parent_tag_id", fromTable: "taxonomy_edges", relationshipKind: "parent_child", required: true, toColumn: "id", toTable: "taxonomy_tags" },
      { fromColumn: "child_tag_id", fromTable: "taxonomy_edges", relationshipKind: "parent_child", required: true, toColumn: "id", toTable: "taxonomy_tags" },
      { fromColumn: "target_id", fromTable: "taxonomy_review_actions", relationshipKind: "review_targets", required: false, toColumn: "actionId", toTable: "taxonomyReviewPlan.actions" },
      { fromColumn: "pack_id", fromTable: "taxonomy_pack_versions", relationshipKind: "version_of", required: true, toColumn: "id", toTable: "taxonomy_packs" },
      { fromColumn: "tag_id", fromTable: "question_tag_assignments", relationshipKind: "question_assignment", required: true, toColumn: "id", toTable: "taxonomy_tags" },
    ],
    rlsNotes: [
      "Future tables must enable RLS before exposure.",
      "Admin and super_admin should own official taxonomy mutations.",
      "Teacher private packs need owner-scoped read/write policies.",
      "Public packs may be readable after publish, but never editable by anon/student.",
      "question taxonomy assignments are proposal-only here and must not write official bindings directly.",
    ],
    tables,
  };
}

function contract(
  operationKind: AITaxonomyAdminOperationKind,
  label: string,
  description: string,
  inputShape: AITaxonomyAdminInputField[],
  validationRules: string[],
  safetyRules: string[],
  allowedRoles: AITaxonomyAdminContract["allowedRoles"] = [
    "super_admin",
    "admin",
    "curriculum_reviewer",
  ],
): AITaxonomyAdminContract {
  return {
    allowedRoles,
    description,
    implementedNow: false,
    inputShape,
    label,
    operationKind,
    producesAuditEvent: true,
    safetyRules,
    validationRules,
  };
}

export function buildTaxonomyAdminContracts(): AITaxonomyAdminContract[] {
  return [
    contract(
      "create_pack",
      "Create taxonomy pack",
      "Create a future controlled taxonomy pack after review.",
      [
        field("id_path", "text", true, "Stable pack ID path."),
        field("label", "text", true, "Pack display label."),
        field("visibility", "taxonomy_visibility", true, "Private, school, public, or system."),
      ],
      ["id_path_unique", "visibility_allowed", "label_required"],
      ["create_as_draft", "audit_actor_required"],
    ),
    contract(
      "update_tag",
      "Update tag",
      "Update official tag metadata without changing stable identity.",
      [
        field("tag_id", "uuid", true, "Official tag."),
        field("label", "text", false, "Updated label."),
        field("description", "text", false, "Updated description."),
        field("reason", "text", true, "Human change reason."),
      ],
      ["tag_active", "label_unique_in_pack"],
      ["do_not_change_stable_id", "audit_before_after_required"],
    ),
    contract(
      "deprecate_tag",
      "Deprecate tag",
      "Soft-deprecate or archive a tag instead of hard deleting it.",
      [
        field("tag_id", "uuid", true, "Official tag."),
        field("reason", "text", true, "Deprecation reason."),
      ],
      ["tag_not_already_deprecated", "replacement_tag_optional"],
      ["soft_deprecate_only", "no_hard_delete", "audit_before_after_required"],
    ),
    contract(
      "merge_alias",
      "Merge alias",
      "Attach an alias or near-synonym to a target official tag.",
      [
        field("target_tag_id", "uuid", true, "Official tag receiving alias."),
        field("alias_text", "text", true, "Alias text."),
        field("reason", "text", true, "Merge reason."),
      ],
      ["target_tag_active", "alias_unique_for_target"],
      ["preserve_target_tag_id", "append_alias_audit"],
    ),
    contract(
      "move_parent",
      "Move parent",
      "Move a tag in the hierarchy after validating parent-child safety.",
      [
        field("tag_id", "uuid", true, "Child tag."),
        field("new_parent_tag_id", "uuid", true, "New parent tag."),
        field("reason", "text", true, "Move reason."),
      ],
      ["parent_exists", "no_cycles", "same_pack_only"],
      ["audit_before_after_required", "do_not_delete_old_versions"],
    ),
    contract(
      "approve_review_action",
      "Approve review action",
      "Approve a persisted taxonomy review action for later execution.",
      [
        field("review_action_id", "uuid", true, "Review action."),
        field("reason", "text", true, "Approval reason."),
      ],
      ["review_action_pending", "reviewer_authorized", "validation_passed"],
      ["human_approval_required", "audit_actor_required"],
    ),
    contract(
      "reject_review_action",
      "Reject review action",
      "Reject a taxonomy review action without mutating official taxonomy.",
      [
        field("review_action_id", "uuid", true, "Review action."),
        field("reason", "text", true, "Rejection reason."),
      ],
      ["review_action_pending", "reason_required"],
      ["no_official_mutation", "audit_actor_required"],
    ),
    contract(
      "publish_pack_version",
      "Publish pack version",
      "Publish an immutable taxonomy pack version after review.",
      [
        field("pack_id", "uuid", true, "Pack to publish."),
        field("version_label", "text", true, "Version label."),
        field("reason", "text", true, "Publish reason."),
      ],
      ["pack_ready", "version_label_unique", "no_pending_blockers"],
      ["immutable_snapshot", "audit_actor_required"],
    ),
    contract(
      "rollback_pack_version",
      "Rollback pack version",
      "Activate a prior immutable pack version.",
      [
        field("pack_id", "uuid", true, "Pack to rollback."),
        field("version_id", "uuid", true, "Prior version."),
        field("reason", "text", true, "Rollback reason."),
      ],
      ["version_belongs_to_pack", "version_available"],
      ["activate_previous_version", "audit_before_after_required"],
      ["super_admin", "admin"],
    ),
  ];
}

export function buildTaxonomyMigrationPlanProposal(): AITaxonomyMigrationPlanProposal {
  return {
    mode: "proposal_only",
    noMigrationAdded: true,
    phases: [
      {
        blockedUntil: ["Jerry approves official taxonomy storage schema", "RLS policy design reviewed"],
        description: "Create taxonomy packs and official tag tables with RLS.",
        label: "Official taxonomy storage",
        phaseId: "taxonomy_storage_v1",
        proposedTables: ["taxonomy_packs", "taxonomy_tags"],
        safeToImplementLater: true,
      },
      {
        blockedUntil: ["Official taxonomy storage exists", "Alias governance approved"],
        description: "Add aliases and hierarchy edges.",
        label: "Alias and hierarchy mapping",
        phaseId: "taxonomy_alias_hierarchy_v1",
        proposedTables: ["taxonomy_aliases", "taxonomy_edges"],
        safeToImplementLater: true,
      },
      {
        blockedUntil: ["Review UI approved", "Audit event contract approved"],
        description: "Persist review actions and immutable pack versions.",
        label: "Review workflow and versioning",
        phaseId: "taxonomy_review_versioning_v1",
        proposedTables: ["taxonomy_review_actions", "taxonomy_pack_versions"],
        safeToImplementLater: true,
      },
      {
        blockedUntil: ["Official taxonomy stable", "Human review flow tested"],
        description: "Add future official question tag assignments.",
        label: "Question assignment contract",
        phaseId: "taxonomy_question_assignments_v1",
        proposedTables: ["question_tag_assignments"],
        safeToImplementLater: true,
      },
    ],
    recommendedFirstMigration: "0008_taxonomy_storage_foundation.sql",
    risks: [
      "Do not reuse current flexible tags table as official taxonomy without review.",
      "Question assignments must not bypass draft review or publish readiness.",
      "Teacher private packs need owner-scoped RLS before launch.",
    ],
  };
}

export function buildTaxonomyVersioningPlan(): AITaxonomyVersioningPlan {
  return {
    aliasChangeStrategy: "append_only_audit",
    deprecationStrategy: "soft_deprecate_do_not_delete",
    notes: [
      "Official tag IDs should remain stable across label changes.",
      "Pack publication should snapshot approved taxonomy state.",
      "Rollback should activate a prior pack version rather than deleting history.",
    ],
    packVersionStrategy: "immutable_pack_versions",
    rollbackStrategy: "activate_previous_pack_version",
    tagIdStability: "stable_official_ids",
  };
}

export function buildTaxonomyAuditPlan(): AITaxonomyAuditPlan {
  return {
    auditEvents: [
      { actorRequired: true, beforeAfterRequired: false, eventKind: "tag_created", reasonRequired: true },
      { actorRequired: true, beforeAfterRequired: true, eventKind: "tag_updated", reasonRequired: true },
      { actorRequired: true, beforeAfterRequired: true, eventKind: "tag_deprecated", reasonRequired: true },
      { actorRequired: true, beforeAfterRequired: false, eventKind: "alias_added", reasonRequired: true },
      { actorRequired: true, beforeAfterRequired: true, eventKind: "parent_changed", reasonRequired: true },
      { actorRequired: true, beforeAfterRequired: true, eventKind: "review_action_approved", reasonRequired: true },
      { actorRequired: true, beforeAfterRequired: true, eventKind: "review_action_rejected", reasonRequired: true },
      { actorRequired: true, beforeAfterRequired: false, eventKind: "pack_published", reasonRequired: true },
      { actorRequired: true, beforeAfterRequired: true, eventKind: "pack_rolled_back", reasonRequired: true },
    ],
    requiredFields: [
      "event_kind",
      "actor_id",
      "target_table",
      "target_id",
      "reason",
      "created_at",
    ],
    retentionNotes: [
      "Keep taxonomy audit events append-only.",
      "Do not store raw provider responses in audit payloads.",
      "Store before/after bounded JSON only for official taxonomy changes.",
    ],
  };
}

export function validateTaxonomyPersistencePlan({
  adminContracts,
  proposedStorageModel,
  sourceReviewPlanPresent,
}: {
  adminContracts: AITaxonomyAdminContract[];
  proposedStorageModel: AITaxonomyStorageModelProposal;
  sourceReviewPlanPresent: boolean;
}): AITaxonomyPersistenceValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const adminContractsRequireRoles = adminContracts.every(
    (contractItem) => contractItem.allowedRoles.length > 0,
  );
  const auditRequiredForMutations = adminContracts.every(
    (contractItem) => contractItem.producesAuditEvent === true,
  );
  const softDeleteOrDeprecationOnly = adminContracts.some(
    (contractItem) => contractItem.operationKind === "deprecate_tag",
  );
  const hasQuestionAssignmentsProposal = proposedStorageModel.tables.some(
    (table) => table.tableName === "question_tag_assignments",
  );

  if (!sourceReviewPlanPresent) {
    warnings.push("taxonomy_persistence_review_plan_missing");
  }

  if (!adminContractsRequireRoles) {
    errors.push("admin_contract_missing_roles");
  }

  if (!auditRequiredForMutations) {
    errors.push("admin_contract_missing_audit_event");
  }

  if (!softDeleteOrDeprecationOnly) {
    errors.push("hard_delete_contract_detected");
  }

  if (!hasQuestionAssignmentsProposal) {
    errors.push("question_assignment_proposal_missing");
  }

  return {
    adminContractsRequireRoles,
    auditRequiredForMutations,
    errors,
    noDbMutation: true,
    noMigrationAdded: true,
    noOfficialPromotion: true,
    softDeleteOrDeprecationOnly,
    sourceReviewPlanPresent,
    valid: errors.length === 0,
    warnings,
  };
}

function buildStats({
  adminContracts,
  auditPlan,
  migrationPlan,
  proposedStorageModel,
  warnings,
}: {
  adminContracts: AITaxonomyAdminContract[];
  auditPlan: AITaxonomyAuditPlan;
  migrationPlan: AITaxonomyMigrationPlanProposal;
  proposedStorageModel: AITaxonomyStorageModelProposal;
  warnings: string[];
}): AITaxonomyPersistencePlanStats {
  return {
    adminContractCount: adminContracts.length,
    auditEventCount: auditPlan.auditEvents.length,
    migrationPhaseCount: migrationPlan.phases.length,
    proposedIndexCount: proposedStorageModel.indexes.length,
    proposedRelationshipCount: proposedStorageModel.relationships.length,
    proposedTableCount: proposedStorageModel.tables.length,
    warningCount: warnings.length,
  };
}

export function buildAITaxonomyPersistencePlanFromSummary(
  aiPdfImport: unknown,
  generatedAt = new Date().toISOString(),
): AITaxonomyPersistencePlan {
  const summary = asRecord(aiPdfImport);
  const taggingV2PlanPresent = Boolean(summary.taggingV2Plan);
  const taxonomyBootstrapPlanPresent = Boolean(summary.taxonomyBootstrapPlan);
  const taxonomyReviewPlanPresent = Boolean(summary.taxonomyReviewPlan);
  const proposedStorageModel = buildTaxonomyStorageModelProposal();
  const proposedAdminContracts = buildTaxonomyAdminContracts();
  const proposedMigrationPlan = buildTaxonomyMigrationPlanProposal();
  const proposedVersioningPlan = buildTaxonomyVersioningPlan();
  const proposedAuditPlan = buildTaxonomyAuditPlan();
  const validation = validateTaxonomyPersistencePlan({
    adminContracts: proposedAdminContracts,
    proposedStorageModel,
    sourceReviewPlanPresent: taxonomyReviewPlanPresent,
  });
  const warnings = uniqueStrings([
    "taxonomy_persistence_planning_only",
    "taxonomy_persistence_no_db_mutation",
    "taxonomy_persistence_no_migration_added",
    "taxonomy_persistence_no_official_promotion",
    "taxonomy_persistence_admin_contract_only",
    "taxonomy_persistence_question_assignment_proposal_only",
    "taxonomy_persistence_summary_limited",
    ...validation.warnings,
  ]);

  return {
    generatedAt,
    mode: "planning_only",
    proposedAdminContracts,
    proposedAuditPlan,
    proposedMigrationPlan,
    proposedStorageModel,
    proposedVersioningPlan,
    sourcePlans: {
      taggingV2PlanPresent,
      taxonomyBootstrapPlanPresent,
      taxonomyReviewPlanPresent,
    },
    stats: buildStats({
      adminContracts: proposedAdminContracts,
      auditPlan: proposedAuditPlan,
      migrationPlan: proposedMigrationPlan,
      proposedStorageModel,
      warnings,
    }),
    status:
      validation.valid && taxonomyReviewPlanPresent
        ? "completed_with_warnings"
        : validation.valid
          ? "skipped"
          : "failed",
    taxonomyVersion: "edu_taxonomy_v1",
    validation,
    version: "taxonomy_persistence_plan_v1",
    warnings,
  };
}

export function failedAITaxonomyPersistencePlan({
  generatedAt = new Date().toISOString(),
  warnings,
}: {
  generatedAt?: string;
  warnings: string[];
}): AITaxonomyPersistencePlan {
  const proposedStorageModel = buildTaxonomyStorageModelProposal();
  const proposedAdminContracts = buildTaxonomyAdminContracts();
  const proposedMigrationPlan = buildTaxonomyMigrationPlanProposal();
  const proposedAuditPlan = buildTaxonomyAuditPlan();
  const proposedVersioningPlan = buildTaxonomyVersioningPlan();
  const finalWarnings = uniqueStrings([
    "taxonomy_persistence_planning_only",
    "taxonomy_persistence_no_db_mutation",
    "taxonomy_persistence_no_migration_added",
    ...warnings,
  ]);

  return {
    generatedAt,
    mode: "planning_only",
    proposedAdminContracts,
    proposedAuditPlan,
    proposedMigrationPlan,
    proposedStorageModel,
    proposedVersioningPlan,
    sourcePlans: {
      taggingV2PlanPresent: false,
      taxonomyBootstrapPlanPresent: false,
      taxonomyReviewPlanPresent: false,
    },
    stats: buildStats({
      adminContracts: proposedAdminContracts,
      auditPlan: proposedAuditPlan,
      migrationPlan: proposedMigrationPlan,
      proposedStorageModel,
      warnings: finalWarnings,
    }),
    status: "failed",
    taxonomyVersion: "edu_taxonomy_v1",
    validation: {
      adminContractsRequireRoles: true,
      auditRequiredForMutations: true,
      errors: ["taxonomy_persistence_plan_failed"],
      noDbMutation: true,
      noMigrationAdded: true,
      noOfficialPromotion: true,
      softDeleteOrDeprecationOnly: true,
      sourceReviewPlanPresent: false,
      valid: false,
      warnings: finalWarnings,
    },
    version: "taxonomy_persistence_plan_v1",
    warnings: finalWarnings,
  };
}

export function mergeAITaxonomyPersistencePlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  taxonomyPersistencePlan: AITaxonomyPersistencePlan,
) {
  return {
    ...existingAiPdfImport,
    taxonomyPersistencePlan,
  };
}
