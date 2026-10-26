import crypto from "node:crypto";

import type {
  AITagAliasCandidate,
  AITagCandidateQueueItem,
  AITaxonomyBootstrapPlan,
  AITaxonomyDraftPack,
  AITaxonomyDraftTag,
  AITaxonomyEvidence,
  AITaxonomyReviewAction,
} from "./taxonomy-bootstrap";

type AITaxonomyReviewPlanVersion = "taxonomy_review_plan_v1";

type AITaxonomyReviewPlanStatus =
  | "completed"
  | "completed_with_warnings"
  | "skipped"
  | "failed";

type AITaxonomyReviewTargetType =
  | "draft_tag"
  | "candidate_tag"
  | "alias_candidate"
  | "draft_pack";

type AITaxonomyReviewActionType = AITaxonomyReviewAction;

type AITaxonomyReviewActionStatus =
  | "proposed"
  | "blocked_by_validation"
  | "needs_human_review"
  | "ready_for_future_execution"
  | "skipped";

export interface AITaxonomyReviewPlan {
  actions: AITaxonomyReviewActionDraft[];
  generatedAt: string;
  mode: "planning_only";
  patchPreview: AITaxonomyPatchPreview;
  stats: AITaxonomyReviewPlanStats;
  status: AITaxonomyReviewPlanStatus;
  taxonomyVersion: "edu_taxonomy_v1";
  version: AITaxonomyReviewPlanVersion;
  warnings: string[];
}

export interface AITaxonomyReviewActionDraft {
  actionHash: string;
  actionId: string;
  actionType: AITaxonomyReviewActionType;
  evidenceRefs: AITaxonomyReviewEvidenceRef[];
  humanReview: {
    approved: false;
    executed: false;
    required: true;
    reviewerRole: "admin" | "teacher" | "curriculum_reviewer";
  };
  proposedChange: AITaxonomyProposedChange;
  safety: {
    dbMutation: false;
    officialPromotion: false;
    officialQuestionTagWrite: false;
    planningOnly: true;
    reviewDraftTagWrite: false;
  };
  status: AITaxonomyReviewActionStatus;
  targetHash?: string | null;
  targetId: string;
  targetLabel: string;
  targetType: AITaxonomyReviewTargetType;
  validation: AITaxonomyReviewActionValidation;
  warnings: string[];
}

interface AITaxonomyProposedChange {
  mergeTargetLabel?: string | null;
  mergeTargetTagId?: string | null;
  proposedAliases?: string[];
  proposedLabel?: string | null;
  proposedOfficialId?: string | null;
  proposedParentTagIds?: string[];
  rejectionReason?: string | null;
  requestedEvidence?: string[] | null;
  splitInto?: Array<{
    proposedLabel: string;
    proposedLevel: string;
    proposedParentTagIds: string[];
  }> | null;
}

interface AITaxonomyReviewActionValidation {
  actionAllowedForTargetType: boolean;
  duplicateRisk: boolean;
  errors: string[];
  hasEvidence: boolean;
  hasHumanReviewRequirement: true;
  parentRisk: boolean;
  targetExistsInBootstrapPlan: boolean;
  valid: boolean;
  warnings: string[];
  wouldMutateOfficialTaxonomy: false;
}

interface AITaxonomyReviewEvidenceRef {
  kind:
    | "draft_tag_evidence"
    | "candidate_queue_evidence"
    | "alias_candidate_evidence"
    | "validator_warning"
    | "nearest_existing_tag"
    | "review_action_draft";
  message: string;
  packetIds: string[];
  pageNumbers: number[];
  sourceIds: string[];
}

interface AITaxonomyPatchPreview {
  aliasMergePreviews: AITaxonomyAliasMergePreview[];
  approvedTagPreviews: AITaxonomyApprovedTagPreview[];
  officialMutation: false;
  pendingTargetPreviews: AITaxonomyPendingTargetPreview[];
  rejectedTargetPreviews: AITaxonomyRejectedTargetPreview[];
  mode: "preview_only";
  warnings: string[];
}

interface AITaxonomyApprovedTagPreview {
  aliases: string[];
  description?: string | null;
  label: string;
  level: string;
  parentTagIds: string[];
  proposedOfficialId: string;
  sourceActionId: string;
}

interface AITaxonomyAliasMergePreview {
  aliasText: string;
  sourceActionId: string;
  targetLabel: string;
  targetTagId: string;
}

interface AITaxonomyRejectedTargetPreview {
  reason: string;
  sourceActionId: string;
  targetId: string;
  targetLabel: string;
}

interface AITaxonomyPendingTargetPreview {
  reason: string;
  sourceActionId: string;
  targetId: string;
  targetLabel: string;
}

interface AITaxonomyReviewPlanStats {
  actionCount: number;
  aliasMergePreviewCount: number;
  approvePreviewCount: number;
  blockedActionCount: number;
  duplicateRiskCount: number;
  needsHumanReviewCount: number;
  parentRiskCount: number;
  pendingPreviewCount: number;
  rejectPreviewCount: number;
}

type ReviewTarget =
  | {
      candidate: AITagCandidateQueueItem;
      targetType: "candidate_tag";
    }
  | {
      alias: AITagAliasCandidate;
      targetType: "alias_candidate";
    }
  | {
      draftTag: AITaxonomyDraftTag;
      pack: AITaxonomyDraftPack;
      targetType: "draft_tag";
    }
  | {
      pack: AITaxonomyDraftPack;
      targetType: "draft_pack";
    };

const MAX_ACTIONS = 120;

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

function isBootstrapPlan(value: unknown): value is AITaxonomyBootstrapPlan {
  const record = asRecord(value);

  return record.version === "taxonomy_bootstrap_plan_v1";
}

function targetId(target: ReviewTarget) {
  switch (target.targetType) {
    case "alias_candidate":
      return target.alias.aliasCandidateId;
    case "candidate_tag":
      return target.candidate.candidateId;
    case "draft_pack":
      return target.pack.packId;
    case "draft_tag":
      return target.draftTag.draftTagId;
  }
}

function targetHash(target: ReviewTarget) {
  switch (target.targetType) {
    case "alias_candidate":
      return target.alias.aliasCandidateHash;
    case "candidate_tag":
      return target.candidate.candidateHash;
    case "draft_pack":
      return target.pack.packHash;
    case "draft_tag":
      return target.draftTag.validation
        ? stableHash({
            id: target.draftTag.proposedOfficialId,
            label: target.draftTag.label,
            pack: target.pack.packId,
          })
        : null;
  }
}

function targetLabel(target: ReviewTarget) {
  switch (target.targetType) {
    case "alias_candidate":
      return target.alias.aliasText;
    case "candidate_tag":
      return target.candidate.proposedLabel;
    case "draft_pack":
      return target.pack.label;
    case "draft_tag":
      return target.draftTag.label;
  }
}

function targetEvidence(target: ReviewTarget): AITaxonomyReviewEvidenceRef[] {
  const fromEvidence = (
    kind: AITaxonomyReviewEvidenceRef["kind"],
    sourceIds: string[],
    evidence: AITaxonomyEvidence[],
  ) =>
    evidence.map((item) => ({
      kind,
      message: item.message,
      packetIds: uniqueStrings(item.packetIds),
      pageNumbers: uniqueNumbers(item.pageNumbers),
      sourceIds,
    }));

  switch (target.targetType) {
    case "alias_candidate":
      return fromEvidence(
        "alias_candidate_evidence",
        [target.alias.aliasCandidateId, ...target.alias.sourceCandidateIds],
        target.alias.evidence,
      );
    case "candidate_tag":
      return [
        ...fromEvidence(
          "candidate_queue_evidence",
          [target.candidate.candidateId],
          target.candidate.evidence,
        ),
        ...target.candidate.nearestExistingTags.map((nearest) => ({
          kind: "nearest_existing_tag" as const,
          message: nearest.reason,
          packetIds: [],
          pageNumbers: [],
          sourceIds: [nearest.tagId],
        })),
      ];
    case "draft_pack":
      return [
        {
          kind: "review_action_draft",
          message: "Draft pack requires human taxonomy review.",
          packetIds: [],
          pageNumbers: [],
          sourceIds: [target.pack.packId],
        },
      ];
    case "draft_tag":
      return [
        ...fromEvidence(
          "draft_tag_evidence",
          [target.draftTag.draftTagId],
          target.draftTag.evidence,
        ),
        ...target.draftTag.validation.warnings.map((warning) => ({
          kind: "validator_warning" as const,
          message: warning,
          packetIds: [],
          pageNumbers: [],
          sourceIds: [target.draftTag.draftTagId],
        })),
      ];
  }
}

function allowedActionsForTarget(targetType: AITaxonomyReviewTargetType) {
  switch (targetType) {
    case "alias_candidate":
      return new Set<AITaxonomyReviewActionType>([
        "merge_as_alias",
        "reject",
        "needs_more_evidence",
        "keep_pending",
      ]);
    case "candidate_tag":
      return new Set<AITaxonomyReviewActionType>([
        "approve_as_official",
        "reject",
        "merge_as_alias",
        "rename",
        "move_parent",
        "split_tag",
        "needs_more_evidence",
        "keep_pending",
      ]);
    case "draft_pack":
      return new Set<AITaxonomyReviewActionType>([
        "needs_more_evidence",
        "keep_pending",
      ]);
    case "draft_tag":
      return new Set<AITaxonomyReviewActionType>([
        "approve_as_official",
        "reject",
        "merge_as_alias",
        "rename",
        "move_parent",
        "split_tag",
        "needs_more_evidence",
        "keep_pending",
      ]);
  }
}

function duplicateRisk(target: ReviewTarget) {
  switch (target.targetType) {
    case "alias_candidate":
      return false;
    case "candidate_tag":
      return target.candidate.warnings.includes(
        "taxonomy_bootstrap_duplicate_likely",
      );
    case "draft_pack":
      return target.pack.tagDrafts.some((tag) => tag.validation.duplicateLikely);
    case "draft_tag":
      return target.draftTag.validation.duplicateLikely;
  }
}

function parentRisk(target: ReviewTarget) {
  switch (target.targetType) {
    case "alias_candidate":
    case "draft_pack":
      return false;
    case "candidate_tag":
      return (
        !target.candidate.proposedParentTagIds.length &&
        !["format", "difficulty", "cognitive_process", "error_type", "subject"].includes(
          target.candidate.proposedLevel,
        )
      );
    case "draft_tag":
      return !target.draftTag.validation.parentKnownOrPending;
  }
}

function proposedChangeFor({
  actionType,
  target,
}: {
  actionType: AITaxonomyReviewActionType;
  target: ReviewTarget;
}): AITaxonomyProposedChange {
  if (target.targetType === "alias_candidate") {
    return {
      mergeTargetLabel: target.alias.targetLabel,
      mergeTargetTagId: target.alias.targetTagId,
      proposedAliases: [target.alias.aliasText],
      rejectionReason:
        actionType === "reject" ? "Alias candidate rejected by reviewer." : null,
      requestedEvidence:
        actionType === "needs_more_evidence"
          ? ["Add examples showing this alias means the same tag."]
          : null,
    };
  }

  if (target.targetType === "candidate_tag") {
    const nearest = target.candidate.nearestExistingTags[0];

    return {
      mergeTargetLabel:
        actionType === "merge_as_alias" ? nearest?.label ?? null : null,
      mergeTargetTagId:
        actionType === "merge_as_alias" ? nearest?.tagId ?? null : null,
      proposedAliases: target.candidate.proposedAliases,
      proposedLabel:
        actionType === "rename"
          ? `${target.candidate.proposedLabel} (reviewed)`
          : target.candidate.proposedLabel,
      proposedOfficialId: `candidate.${target.candidate.proposedLevel}.${target.candidate.candidateHash.slice(0, 10)}`,
      proposedParentTagIds: target.candidate.proposedParentTagIds,
      rejectionReason:
        actionType === "reject"
          ? target.candidate.warnings.join(", ") || "Candidate rejected."
          : null,
      requestedEvidence:
        actionType === "needs_more_evidence"
          ? ["Attach more packet examples before approving this candidate."]
          : null,
      splitInto:
        actionType === "split_tag"
          ? [
              {
                proposedLabel: `${target.candidate.proposedLabel} concept A`,
                proposedLevel: target.candidate.proposedLevel,
                proposedParentTagIds: target.candidate.proposedParentTagIds,
              },
              {
                proposedLabel: `${target.candidate.proposedLabel} concept B`,
                proposedLevel: target.candidate.proposedLevel,
                proposedParentTagIds: target.candidate.proposedParentTagIds,
              },
            ]
          : null,
    };
  }

  if (target.targetType === "draft_pack") {
    return {
      requestedEvidence:
        actionType === "needs_more_evidence"
          ? ["Review all draft tags in this pack before executing any taxonomy patch."]
          : null,
    };
  }

  return {
    mergeTargetLabel:
      actionType === "merge_as_alias" ? target.draftTag.relatedTagIds[0] ?? null : null,
    mergeTargetTagId:
      actionType === "merge_as_alias" ? target.draftTag.relatedTagIds[0] ?? null : null,
    proposedAliases: target.draftTag.aliases,
    proposedLabel:
      actionType === "rename"
        ? `${target.draftTag.label} (reviewed)`
        : target.draftTag.label,
    proposedOfficialId: target.draftTag.proposedOfficialId,
    proposedParentTagIds: target.draftTag.parentTagIds,
    rejectionReason:
      actionType === "reject"
        ? target.draftTag.validation.errors.join(", ") || "Draft tag rejected."
        : null,
    requestedEvidence:
      actionType === "needs_more_evidence"
        ? ["Add more examples before approving this draft tag."]
        : null,
    splitInto:
      actionType === "split_tag"
        ? [
            {
              proposedLabel: `${target.draftTag.label} concept A`,
              proposedLevel: target.draftTag.level,
              proposedParentTagIds: target.draftTag.parentTagIds,
            },
            {
              proposedLabel: `${target.draftTag.label} concept B`,
              proposedLevel: target.draftTag.level,
              proposedParentTagIds: target.draftTag.parentTagIds,
            },
          ]
        : null,
  };
}

function defaultActionForTarget(target: ReviewTarget): AITaxonomyReviewActionType {
  switch (target.targetType) {
    case "alias_candidate":
      return "merge_as_alias";
    case "candidate_tag":
      return target.candidate.recommendedReviewAction;
    case "draft_pack":
      return "keep_pending";
    case "draft_tag":
      if (!target.draftTag.validation.valid) {
        if (
          target.draftTag.validation.errors.includes("missing_parent") ||
          target.draftTag.validation.errors.includes(
            "unknown_or_pending_parent_missing",
          )
        ) {
          return "move_parent";
        }

        if (
          target.draftTag.validation.errors.includes("missing_evidence") ||
          target.draftTag.validation.genericTooBroad
        ) {
          return "reject";
        }

        return "needs_more_evidence";
      }

      return target.draftTag.validation.duplicateLikely
        ? "merge_as_alias"
        : "approve_as_official";
  }
}

function targetMapFromBootstrapPlan(bootstrapPlan: AITaxonomyBootstrapPlan) {
  const targets = new Map<string, ReviewTarget>();

  for (const pack of bootstrapPlan.draftPacks) {
    targets.set(pack.packId, { pack, targetType: "draft_pack" });

    for (const draftTag of pack.tagDrafts) {
      targets.set(draftTag.draftTagId, { draftTag, pack, targetType: "draft_tag" });
    }
  }

  for (const candidate of bootstrapPlan.candidateQueue) {
    targets.set(candidate.candidateId, { candidate, targetType: "candidate_tag" });
  }

  for (const alias of bootstrapPlan.aliasCandidates) {
    targets.set(alias.aliasCandidateId, { alias, targetType: "alias_candidate" });
  }

  return targets;
}

function validateTaxonomyReviewAction({
  action,
  bootstrapPlan,
}: {
  action: Omit<AITaxonomyReviewActionDraft, "status" | "validation" | "warnings">;
  bootstrapPlan: AITaxonomyBootstrapPlan;
}): AITaxonomyReviewActionValidation {
  const targetMap = targetMapFromBootstrapPlan(bootstrapPlan);
  const target = targetMap.get(action.targetId);
  const errors: string[] = [];
  const warnings: string[] = [];
  const targetExistsInBootstrapPlan = Boolean(target);
  const actionAllowedForTargetType = target
    ? allowedActionsForTarget(action.targetType).has(action.actionType)
    : false;
  const hasEvidence = action.evidenceRefs.length > 0;
  const hasHumanReviewRequirement =
    action.humanReview.required === true &&
    action.humanReview.approved === false &&
    action.humanReview.executed === false;
  const safetyCorrect =
    action.safety.planningOnly === true &&
    action.safety.dbMutation === false &&
    action.safety.officialPromotion === false &&
    action.safety.officialQuestionTagWrite === false &&
    action.safety.reviewDraftTagWrite === false;
  const actionDuplicateRisk = target ? duplicateRisk(target) : false;
  const actionParentRisk = target ? parentRisk(target) : false;

  if (!targetExistsInBootstrapPlan) {
    errors.push("target_missing_from_bootstrap_plan");
  }

  if (!actionAllowedForTargetType) {
    errors.push("action_not_allowed_for_target_type");
  }

  if (!hasEvidence) {
    errors.push("missing_evidence");
  }

  if (!hasHumanReviewRequirement) {
    errors.push("missing_human_review_requirement");
  }

  if (!safetyCorrect) {
    errors.push("unsafe_action_flags");
  }

  if (action.actionType === "approve_as_official" && actionDuplicateRisk) {
    errors.push("approve_blocked_duplicate_risk");
    warnings.push("taxonomy_review_action_blocked_duplicate");
  }

  if (action.actionType === "approve_as_official" && actionParentRisk) {
    errors.push("approve_blocked_parent_risk");
    warnings.push("taxonomy_review_action_blocked_missing_parent");
  }

  if (
    action.actionType === "merge_as_alias" &&
    !action.proposedChange.mergeTargetTagId
  ) {
    errors.push("merge_alias_missing_target");
  }

  if (action.actionType === "reject" && !action.proposedChange.rejectionReason) {
    errors.push("reject_missing_reason");
  }

  return {
    actionAllowedForTargetType,
    duplicateRisk: actionDuplicateRisk,
    errors,
    hasEvidence,
    hasHumanReviewRequirement: true,
    parentRisk: actionParentRisk,
    targetExistsInBootstrapPlan,
    valid: errors.length === 0,
    warnings,
    wouldMutateOfficialTaxonomy: false,
  };
}

function buildTaxonomyReviewAction({
  actionType,
  bootstrapPlan,
  target,
}: {
  actionType?: AITaxonomyReviewActionType;
  bootstrapPlan: AITaxonomyBootstrapPlan;
  target: ReviewTarget;
}): AITaxonomyReviewActionDraft {
  const resolvedActionType = actionType ?? defaultActionForTarget(target);
  const proposedChange = proposedChangeFor({
    actionType: resolvedActionType,
    target,
  });
  const baseAction = {
    actionHash: "",
    actionId: "",
    actionType: resolvedActionType,
    evidenceRefs: targetEvidence(target),
    humanReview: {
      approved: false as const,
      executed: false as const,
      required: true as const,
      reviewerRole: "admin" as const,
    },
    proposedChange,
    safety: {
      dbMutation: false as const,
      officialPromotion: false as const,
      officialQuestionTagWrite: false as const,
      planningOnly: true as const,
      reviewDraftTagWrite: false as const,
    },
    targetHash: targetHash(target),
    targetId: targetId(target),
    targetLabel: targetLabel(target),
    targetType: target.targetType,
  };
  const actionHash = stableHash({
    actionType: baseAction.actionType,
    proposedChange: baseAction.proposedChange,
    targetHash: baseAction.targetHash,
    targetId: baseAction.targetId,
    targetType: baseAction.targetType,
  });
  const actionWithIdentity = {
    ...baseAction,
    actionHash,
    actionId: `taxonomy-review-${actionHash.slice(0, 12)}`,
  };
  const validation = validateTaxonomyReviewAction({
    action: actionWithIdentity,
    bootstrapPlan,
  });
  const status: AITaxonomyReviewActionStatus = validation.valid
    ? resolvedActionType === "approve_as_official" ||
      resolvedActionType === "merge_as_alias" ||
      resolvedActionType === "reject"
      ? "ready_for_future_execution"
      : "needs_human_review"
    : "blocked_by_validation";

  return {
    ...actionWithIdentity,
    status,
    validation,
    warnings: validation.warnings,
  };
}

function actionsFromBootstrapPlan(bootstrapPlan: AITaxonomyBootstrapPlan) {
  const targetMap = targetMapFromBootstrapPlan(bootstrapPlan);
  const actions: AITaxonomyReviewActionDraft[] = [];

  for (const draft of bootstrapPlan.reviewActions) {
    const target = targetMap.get(draft.targetId);

    if (!target) {
      continue;
    }

    actions.push(
      buildTaxonomyReviewAction({
        actionType: draft.recommendedAction,
        bootstrapPlan,
        target,
      }),
    );
  }

  for (const alias of bootstrapPlan.aliasCandidates) {
    const target = targetMap.get(alias.aliasCandidateId);

    if (target) {
      actions.push(
        buildTaxonomyReviewAction({
          actionType: "merge_as_alias",
          bootstrapPlan,
          target,
        }),
      );
    }
  }

  const seenTargets = new Set(actions.map((action) => action.targetId));

  for (const candidate of bootstrapPlan.candidateQueue) {
    if (seenTargets.has(candidate.candidateId)) {
      continue;
    }

    const target = targetMap.get(candidate.candidateId);

    if (target) {
      actions.push(buildTaxonomyReviewAction({ bootstrapPlan, target }));
    }
  }

  return actions.slice(0, MAX_ACTIONS);
}

function buildTaxonomyPatchPreview(
  actions: AITaxonomyReviewActionDraft[],
): AITaxonomyPatchPreview {
  const approvedTagPreviews: AITaxonomyApprovedTagPreview[] = [];
  const aliasMergePreviews: AITaxonomyAliasMergePreview[] = [];
  const rejectedTargetPreviews: AITaxonomyRejectedTargetPreview[] = [];
  const pendingTargetPreviews: AITaxonomyPendingTargetPreview[] = [];
  const warnings = [
    "taxonomy_review_preview_only",
    "taxonomy_review_no_db_mutation",
  ];

  for (const action of actions) {
    if (action.status === "blocked_by_validation") {
      pendingTargetPreviews.push({
        reason: action.validation.errors.join(", ") || "Blocked by validation.",
        sourceActionId: action.actionId,
        targetId: action.targetId,
        targetLabel: action.targetLabel,
      });
      continue;
    }

    if (action.actionType === "approve_as_official") {
      approvedTagPreviews.push({
        aliases: action.proposedChange.proposedAliases ?? [],
        description: null,
        label: action.proposedChange.proposedLabel ?? action.targetLabel,
        level: action.targetType,
        parentTagIds: action.proposedChange.proposedParentTagIds ?? [],
        proposedOfficialId:
          action.proposedChange.proposedOfficialId ?? action.targetId,
        sourceActionId: action.actionId,
      });
      continue;
    }

    if (action.actionType === "merge_as_alias") {
      aliasMergePreviews.push({
        aliasText:
          action.proposedChange.proposedAliases?.[0] ?? action.targetLabel,
        sourceActionId: action.actionId,
        targetLabel: action.proposedChange.mergeTargetLabel ?? "Unknown target",
        targetTagId: action.proposedChange.mergeTargetTagId ?? "unknown",
      });
      continue;
    }

    if (action.actionType === "reject") {
      rejectedTargetPreviews.push({
        reason: action.proposedChange.rejectionReason ?? "Rejected by reviewer.",
        sourceActionId: action.actionId,
        targetId: action.targetId,
        targetLabel: action.targetLabel,
      });
      continue;
    }

    pendingTargetPreviews.push({
      reason:
        action.proposedChange.requestedEvidence?.join(", ") ||
        "Pending human taxonomy review.",
      sourceActionId: action.actionId,
      targetId: action.targetId,
      targetLabel: action.targetLabel,
    });
  }

  return {
    aliasMergePreviews,
    approvedTagPreviews,
    officialMutation: false,
    pendingTargetPreviews,
    rejectedTargetPreviews,
    mode: "preview_only",
    warnings,
  };
}

function reviewPlanStats({
  actions,
  patchPreview,
}: {
  actions: AITaxonomyReviewActionDraft[];
  patchPreview: AITaxonomyPatchPreview;
}): AITaxonomyReviewPlanStats {
  return {
    actionCount: actions.length,
    aliasMergePreviewCount: patchPreview.aliasMergePreviews.length,
    approvePreviewCount: patchPreview.approvedTagPreviews.length,
    blockedActionCount: actions.filter(
      (action) => action.status === "blocked_by_validation",
    ).length,
    duplicateRiskCount: actions.filter((action) => action.validation.duplicateRisk)
      .length,
    needsHumanReviewCount: actions.filter(
      (action) => action.humanReview.required === true,
    ).length,
    parentRiskCount: actions.filter((action) => action.validation.parentRisk).length,
    pendingPreviewCount: patchPreview.pendingTargetPreviews.length,
    rejectPreviewCount: patchPreview.rejectedTargetPreviews.length,
  };
}

export function buildAITaxonomyReviewPlanFromBootstrapPlan(
  taxonomyBootstrapPlan: unknown,
): AITaxonomyReviewPlan {
  const warnings = [
    "taxonomy_review_planning_only",
    "taxonomy_review_no_db_mutation",
    "taxonomy_review_no_official_promotion",
    "taxonomy_review_no_question_tag_write",
    "taxonomy_review_human_required",
  ];

  if (!isBootstrapPlan(taxonomyBootstrapPlan)) {
    return {
      actions: [],
      generatedAt: new Date().toISOString(),
      mode: "planning_only",
      patchPreview: {
        aliasMergePreviews: [],
        approvedTagPreviews: [],
        officialMutation: false,
        pendingTargetPreviews: [],
        rejectedTargetPreviews: [],
        mode: "preview_only",
        warnings: ["taxonomy_review_missing_bootstrap_plan"],
      },
      stats: {
        actionCount: 0,
        aliasMergePreviewCount: 0,
        approvePreviewCount: 0,
        blockedActionCount: 0,
        duplicateRiskCount: 0,
        needsHumanReviewCount: 0,
        parentRiskCount: 0,
        pendingPreviewCount: 0,
        rejectPreviewCount: 0,
      },
      status: "skipped",
      taxonomyVersion: "edu_taxonomy_v1",
      version: "taxonomy_review_plan_v1",
      warnings: [...warnings, "taxonomy_review_missing_bootstrap_plan"],
    };
  }

  let actions = actionsFromBootstrapPlan(taxonomyBootstrapPlan);

  if (actions.length >= MAX_ACTIONS) {
    warnings.push("taxonomy_review_summary_limited");
  }

  actions = actions.slice(0, MAX_ACTIONS);
  const patchPreview = buildTaxonomyPatchPreview(actions);
  const stats = reviewPlanStats({ actions, patchPreview });

  if (stats.blockedActionCount > 0) {
    warnings.push("taxonomy_review_action_blocked");
  }

  if (stats.duplicateRiskCount > 0) {
    warnings.push("taxonomy_review_action_blocked_duplicate");
  }

  if (stats.parentRiskCount > 0) {
    warnings.push("taxonomy_review_action_blocked_missing_parent");
  }

  return {
    actions,
    generatedAt: new Date().toISOString(),
    mode: "planning_only",
    patchPreview,
    stats,
    status:
      actions.length === 0
        ? "skipped"
        : warnings.length > 5 || stats.blockedActionCount > 0
          ? "completed_with_warnings"
          : "completed",
    taxonomyVersion: "edu_taxonomy_v1",
    version: "taxonomy_review_plan_v1",
    warnings: uniqueStrings(warnings),
  };
}

export function failedAITaxonomyReviewPlan({
  generatedAt = new Date().toISOString(),
  warnings,
}: {
  generatedAt?: string;
  warnings: string[];
}): AITaxonomyReviewPlan {
  return {
    actions: [],
    generatedAt,
    mode: "planning_only",
    patchPreview: {
      aliasMergePreviews: [],
      approvedTagPreviews: [],
      officialMutation: false,
      pendingTargetPreviews: [],
      rejectedTargetPreviews: [],
      mode: "preview_only",
      warnings,
    },
    stats: {
      actionCount: 0,
      aliasMergePreviewCount: 0,
      approvePreviewCount: 0,
      blockedActionCount: 0,
      duplicateRiskCount: 0,
      needsHumanReviewCount: 0,
      parentRiskCount: 0,
      pendingPreviewCount: 0,
      rejectPreviewCount: 0,
    },
    status: "failed",
    taxonomyVersion: "edu_taxonomy_v1",
    version: "taxonomy_review_plan_v1",
    warnings,
  };
}

export function mergeAITaxonomyReviewPlanIntoSummary(
  existingAiPdfImport: Record<string, unknown>,
  taxonomyReviewPlan: AITaxonomyReviewPlan,
) {
  return {
    ...existingAiPdfImport,
    taxonomyReviewPlan,
  };
}
