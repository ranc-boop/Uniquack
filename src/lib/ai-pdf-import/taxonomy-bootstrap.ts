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

function emptyStats(): AITaxonomyBootstrapPlanStats {
  return {
    aliasCandidateCount: 0,
    candidateQueueCount: 0,
    draftPackCount: 0,
    draftTagCount: 0,
    duplicateLikelyCount: 0,
    needsParentReviewCount: 0,
    rejectedOrInvalidCount: 0,
    reviewActionCount: 0,
  };
}

function planHash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function disabledPlan({
  sourceKind = "pdf",
  status = "skipped",
  warnings = [],
}: {
  sourceKind?: "pdf" | "single_image";
  status?: AITaxonomyBootstrapPlanStatus;
  warnings?: string[];
} = {}): AITaxonomyBootstrapPlan {
  const mergedWarnings = [
    "AI taxonomy creation is disabled. Import may only assign existing exact tag_id values.",
    ...warnings,
  ];

  return {
    aliasCandidates: [],
    candidateQueue: [],
    draftPacks: [],
    generatedAt: new Date().toISOString(),
    mode: "planning_only",
    reviewActions: [],
    sourceKind,
    stats: emptyStats(),
    status,
    taxonomyVersion: "edu_taxonomy_v1",
    version: "taxonomy_bootstrap_plan_v1",
    warnings: Array.from(new Set(mergedWarnings)),
  };
}

export function validateTaxonomyDraftTag({
  draftTag,
}: {
  draftTag: Pick<
    AITaxonomyDraftTag,
    "evidence" | "label" | "level" | "parentTagIds" | "proposedOfficialId"
  >;
}): AITaxonomyDraftTagValidation {
  const errors: string[] = [];
  const warnings = [
    "AI taxonomy creation is disabled; draft tags are not promoted to official taxonomy.",
  ];
  const hasEvidence = draftTag.evidence.length > 0;
  const idShapeValid = /^math\.[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/.test(
    draftTag.proposedOfficialId,
  );
  const levelValid = Boolean(draftTag.level);
  const parentKnownOrPending = draftTag.parentTagIds.length > 0;

  if (!hasEvidence) errors.push("missing_evidence");
  if (!idShapeValid) errors.push("invalid_official_id_shape");
  if (!levelValid) errors.push("missing_level");
  if (!parentKnownOrPending) errors.push("missing_parent_context");

  return {
    duplicateLikely: false,
    errors,
    genericTooBroad: false,
    hasEvidence,
    idShapeValid,
    levelValid,
    parentKnownOrPending,
    valid: errors.length === 0,
    warnings,
  };
}

export function buildStarterTaxonomyDraftPacks(): AITaxonomyDraftPack[] {
  return [];
}

export function buildAITaxonomyBootstrapPlanFromSummary(aiPdfImport: {
  preanalysis?: { sourceKind?: unknown } | null;
  taggingV2Plan?: { sourceKind?: unknown } | null;
}): AITaxonomyBootstrapPlan {
  const sourceKind =
    aiPdfImport.taggingV2Plan?.sourceKind === "single_image" ||
    aiPdfImport.preanalysis?.sourceKind === "single_image"
      ? "single_image"
      : "pdf";

  const plan = disabledPlan({ sourceKind });
  const hash = planHash({ sourceKind, warnings: plan.warnings });

  return {
    ...plan,
    warnings: [...plan.warnings, `bootstrap_disabled_hash:${hash.slice(0, 12)}`],
  };
}

export function failedAITaxonomyBootstrapPlan({
  sourceKind = "pdf",
  warnings = [],
}: {
  sourceKind?: "pdf" | "single_image";
  warnings?: string[];
} = {}): AITaxonomyBootstrapPlan {
  return disabledPlan({ sourceKind, status: "failed", warnings });
}

export function mergeAITaxonomyBootstrapPlanIntoSummary<
  T extends Record<string, unknown>,
>(aiPdfImport: T, taxonomyBootstrapPlan: AITaxonomyBootstrapPlan) {
  return {
    ...aiPdfImport,
    taxonomyBootstrapPlan,
  };
}
