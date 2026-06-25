import "server-only";

import type {
  AIQuestionBlueprintDraft,
  AIQuestionBlueprintDraftPlan,
} from "@/lib/ai-pdf-import/question-blueprint-analyzer";
import type {
  QuestionBlueprintReviewAction,
  QuestionBlueprintReviewActionKind,
  QuestionBlueprintReviewActionPlan,
} from "@/lib/blueprints/question-blueprint-review";
import {
  formatBlueprintQualityError,
  validateQuestionBlueprintQuality,
} from "@/lib/blueprints/question-blueprint-quality";

type SupabaseLike = {
  from: (table: string) => any;
};

export type QuestionBlueprintReviewActionStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "needs_more_evidence"
  | "archived";

export type QuestionBlueprintRow = {
  answer_spec_pattern: Record<string, unknown>;
  created_by?: string | null;
  deleted_at?: string | null;
  difficulty_profile: Record<string, unknown>;
  distractor_pattern: string[];
  generation_constraints: string[];
  originality_constraints: string[];
  owner_id?: string | null;
  owner_scope: "system" | "school" | "teacher" | "private";
  question_pattern: Record<string, unknown>;
  required_elements: string[];
  source_refs: Record<string, unknown>;
  status: "draft" | "approved" | "deprecated";
  taxonomy_targets: Record<string, string[]>;
  title: string;
  updated_by?: string | null;
  version: number;
};

export type QuestionBlueprintExampleRow = {
  asset_refs: string[];
  evidence_snippets: string[];
  source_kind: "import_batch" | "question" | "pdf_page" | "image" | "manual" | "unknown";
  source_ref: Record<string, unknown>;
};

export type QuestionBlueprintReviewActionRow = {
  action_id: string;
  action_kind: QuestionBlueprintReviewActionKind;
  blueprint_draft_id: string;
  created_by?: string | null;
  draft_snapshot: AIQuestionBlueprintDraft;
  evidence: Record<string, unknown>;
  import_batch_id?: string | null;
  reason: string;
  status: QuestionBlueprintReviewActionStatus;
  updated_by?: string | null;
};

export type StoredQuestionBlueprintReviewAction = QuestionBlueprintReviewActionRow & {
  id: string;
  reviewed_at?: string | null;
  reviewer_id?: string | null;
};

export const QUESTION_BLUEPRINT_DB_TABLES = [
  "question_blueprints",
  "question_blueprint_examples",
  "question_blueprint_review_actions",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown) {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function boundedText(value: unknown, maxLength = 240) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

function aiPdfImportFromSummary(summary: unknown) {
  return asRecord(asRecord(summary).aiPdfImport);
}

function normalizeDraft(value: unknown): AIQuestionBlueprintDraft | null {
  const draft = asRecord(value);
  const draftId = boundedText(draft.draftId, 120);

  if (!draftId) {
    return null;
  }

  return {
    answerSpecPattern: {
      acceptedAnswerGuidance: stringList(
        asRecord(draft.answerSpecPattern).acceptedAnswerGuidance,
      ),
      kind:
        asRecord(draft.answerSpecPattern).kind === "mcq" ||
        asRecord(draft.answerSpecPattern).kind === "fill_blank" ||
        asRecord(draft.answerSpecPattern).kind === "frq" ||
        asRecord(draft.answerSpecPattern).kind === "mixed"
          ? (asRecord(draft.answerSpecPattern)
              .kind as AIQuestionBlueprintDraft["answerSpecPattern"]["kind"])
          : "unknown",
      requiredAnswerFields: stringList(
        asRecord(draft.answerSpecPattern).requiredAnswerFields,
      ),
    },
    confidence: Number.isFinite(Number(draft.confidence))
      ? Math.min(1, Math.max(0, Number(draft.confidence)))
      : 0,
    difficultyProfile: {
      difficultyDrivers: stringList(
        asRecord(draft.difficultyProfile).difficultyDrivers,
      ),
      estimatedDifficulty:
        Number.isFinite(Number(asRecord(draft.difficultyProfile).estimatedDifficulty))
          ? Math.min(
              1000,
              Math.max(
                0,
                Math.round(
                  Number(asRecord(draft.difficultyProfile).estimatedDifficulty),
                ),
              ),
            )
          : null,
    },
    distractorPattern: stringList(draft.distractorPattern),
    draftId,
    evidence: {
      assetRefs: stringList(asRecord(draft.evidence).assetRefs).slice(0, 12),
      boundedSnippets: stringList(asRecord(draft.evidence).boundedSnippets)
        .map((snippet) => boundedText(snippet, 280))
        .slice(0, 8),
    },
    generationConstraints: stringList(draft.generationConstraints).slice(0, 16),
    originalityConstraints: stringList(draft.originalityConstraints).slice(0, 12),
    questionPattern: boundedText(draft.questionPattern, 800),
    representationPattern: stringList(draft.representationPattern).slice(0, 12),
    requiredElements: stringList(draft.requiredElements).slice(0, 16),
    reviewRequired: true,
    sourcePacketIds: stringList(draft.sourcePacketIds).slice(0, 12),
    taxonomyTargets: {
      concept: stringList(asRecord(draft.taxonomyTargets).concept),
      curriculum: stringList(asRecord(draft.taxonomyTargets).curriculum),
      form: stringList(asRecord(draft.taxonomyTargets).form),
      method: stringList(asRecord(draft.taxonomyTargets).method),
      task: stringList(asRecord(draft.taxonomyTargets).task),
    },
    title: boundedText(draft.title, 160) || "Question blueprint draft",
    variablePattern: stringList(draft.variablePattern).slice(0, 12),
    warnings: stringList(draft.warnings).slice(0, 12),
  };
}

function actionKind(value: unknown): QuestionBlueprintReviewActionKind | null {
  return value === "approve_blueprint" ||
    value === "reject_blueprint" ||
    value === "edit_blueprint" ||
    value === "merge_similar_blueprint" ||
    value === "mark_needs_more_evidence"
    ? value
    : null;
}

function normalizeReviewAction(value: unknown): QuestionBlueprintReviewAction | null {
  const action = asRecord(value);
  const actionId = boundedText(action.actionId, 160);
  const blueprintDraftId = boundedText(action.blueprintDraftId, 120);
  const kind = actionKind(action.actionKind);

  if (!actionId || !blueprintDraftId || !kind) {
    return null;
  }

  return {
    actionId,
    actionKind: kind,
    blueprintDraftId,
    evidence: {
      assetRefs: stringList(asRecord(action.evidence).assetRefs).slice(0, 12),
      boundedSnippets: stringList(asRecord(action.evidence).boundedSnippets)
        .map((snippet) => boundedText(snippet, 280))
        .slice(0, 8),
    },
    reason: boundedText(action.reason, 600),
    reviewRequired: true,
    safety: {
      noDbWrite: true,
      noGeneratedQuestion: true,
      noProviderCall: true,
      noReviewDraftWrite: true,
      planningOnly: true,
    },
    status: "pending_review",
    warnings: stringList(action.warnings).slice(0, 12),
  };
}

function reviewPlanFromSummary(summary: unknown) {
  const aiPdfImport = aiPdfImportFromSummary(summary);
  const draftPlanRecord = asRecord(aiPdfImport.questionBlueprintDraftPlan);
  const reviewPlanRecord = asRecord(aiPdfImport.questionBlueprintReviewPlan);
  const drafts = asArray(draftPlanRecord.blueprintDrafts)
    .map(normalizeDraft)
    .filter((draft): draft is AIQuestionBlueprintDraft => Boolean(draft));
  const actions = asArray(reviewPlanRecord.actions)
    .map(normalizeReviewAction)
    .filter((action): action is QuestionBlueprintReviewAction => Boolean(action));

  return {
    draftPlan: {
      blueprintDrafts: drafts,
      generatedAt: boundedText(draftPlanRecord.generatedAt, 80),
      mode: "analysis_only" as const,
      sourceObservationPlanRef: boundedText(
        draftPlanRecord.sourceObservationPlanRef,
        240,
      ),
      stats: {
        analyzerProviderCallCount: 0,
        blueprintDraftCount: drafts.length,
        evidenceSnippetCount: drafts.reduce(
          (total, draft) => total + draft.evidence.boundedSnippets.length,
          0,
        ),
        generatedQuestionCount: 0 as const,
        normalizedPacketCount: 0,
        rawStorageCount: 0 as const,
        reviewDraftWriteCount: 0 as const,
        warningCount: 0,
      },
      status: "completed" as const,
      version: "question_blueprint_draft_plan_v1" as const,
      warnings: stringList(draftPlanRecord.warnings),
    } satisfies AIQuestionBlueprintDraftPlan,
    reviewPlan: {
      actions,
      generatedAt: boundedText(reviewPlanRecord.generatedAt, 80),
      mode: "planning_only" as const,
      sourceDraftPlanRef: boundedText(reviewPlanRecord.sourceDraftPlanRef, 240),
      stats: {
        approveReadyActionCount: actions.filter(
          (action) => action.actionKind === "approve_blueprint",
        ).length,
        generatedQuestionCount: 0 as const,
        libraryWriteCount: 0,
        pendingReviewActionCount: actions.length,
        rawStorageCount: 0 as const,
        reviewDraftWriteCount: 0 as const,
        reviewableBlueprintDraftCount: actions.length,
        warningCount: 0,
      },
      status: actions.length ? "planned" : "skipped",
      version: "question_blueprint_review_plan_v1" as const,
      warnings: stringList(reviewPlanRecord.warnings),
    } satisfies QuestionBlueprintReviewActionPlan,
  };
}

export function buildQuestionBlueprintReviewActionRowsFromImportSummary({
  createdBy,
  importBatchId,
  summary,
}: {
  createdBy: string;
  importBatchId: string;
  summary: unknown;
}): QuestionBlueprintReviewActionRow[] {
  const { draftPlan, reviewPlan } = reviewPlanFromSummary(summary);
  const draftsById = new Map(
    draftPlan.blueprintDrafts.map((draft) => [draft.draftId, draft]),
  );

  const rows: QuestionBlueprintReviewActionRow[] = [];

  for (const action of reviewPlan.actions) {
    const draft = draftsById.get(action.blueprintDraftId);

    if (!draft) {
      continue;
    }

    rows.push({
      action_id: action.actionId,
      action_kind: action.actionKind,
      blueprint_draft_id: action.blueprintDraftId,
      created_by: createdBy,
      draft_snapshot: draft,
      evidence: {
        ...action.evidence,
        source: "question_blueprint_review_plan",
        warnings: action.warnings,
      },
      import_batch_id: importBatchId,
      reason: action.reason,
      status: "pending_review" as const,
      updated_by: createdBy,
    });
  }

  return rows;
}

export function validateQuestionBlueprintRow(row: QuestionBlueprintRow) {
  const errors: string[] = [];

  if (!row.title.trim()) {
    errors.push("question_blueprint_title_required");
  }

  if (!["system", "school", "teacher", "private"].includes(row.owner_scope)) {
    errors.push("question_blueprint_owner_scope_invalid");
  }

  if (!["draft", "approved", "deprecated"].includes(row.status)) {
    errors.push("question_blueprint_status_invalid");
  }

  if (!row.question_pattern || typeof row.question_pattern !== "object") {
    errors.push("question_blueprint_question_pattern_required");
  }

  if (!Array.isArray(row.required_elements)) {
    errors.push("question_blueprint_required_elements_must_be_array");
  }

  if (!Array.isArray(row.generation_constraints)) {
    errors.push("question_blueprint_generation_constraints_must_be_array");
  }

  if (!Array.isArray(row.originality_constraints)) {
    errors.push("question_blueprint_originality_constraints_must_be_array");
  }

  return {
    errors,
    valid: errors.length === 0,
  };
}

export function getQuestionBlueprintApprovalReadinessFromReviewAction(
  action: { draft_snapshot: unknown },
  knownAssignableTagIds?: ReadonlySet<string>,
) {
  const draft = normalizeDraft(action.draft_snapshot);

  if (!draft) {
    return {
      approvalBlockingReasons: ["Blueprint review action is missing a valid draft snapshot."],
      approvalReady: false,
      generationBlockingReasons: ["Blueprint review action is missing a valid draft snapshot."],
      generationReady: false,
    };
  }

  return validateQuestionBlueprintQuality({
    blueprint: {
      answer_spec_pattern: draft.answerSpecPattern,
      deleted_at: null,
      distractor_pattern: draft.distractorPattern,
      originality_constraints: draft.originalityConstraints,
      question_pattern: {
        pattern: draft.questionPattern,
        representationPattern: draft.representationPattern,
        variablePattern: draft.variablePattern,
      },
      required_elements: draft.requiredElements,
      status: "approved",
      taxonomy_targets: draft.taxonomyTargets,
    },
    evidenceSnippets: draft.evidence.boundedSnippets,
    knownAssignableTagIds,
  });
}

function buildQuestionBlueprintRowFromAction({
  action,
  knownAssignableTagIds,
  reviewerId,
}: {
  action: StoredQuestionBlueprintReviewAction;
  knownAssignableTagIds?: ReadonlySet<string>;
  reviewerId: string;
}) {
  const draft = normalizeDraft(action.draft_snapshot);

  if (!draft) {
    throw new Error("Blueprint review action is missing a valid draft snapshot.");
  }

  const blueprintRow: QuestionBlueprintRow = {
    answer_spec_pattern: draft.answerSpecPattern,
    created_by: reviewerId,
    difficulty_profile: draft.difficultyProfile,
    distractor_pattern: draft.distractorPattern,
    generation_constraints: draft.generationConstraints,
    originality_constraints: draft.originalityConstraints,
    owner_id: null,
    owner_scope: "system",
    question_pattern: {
      pattern: draft.questionPattern,
      representationPattern: draft.representationPattern,
      variablePattern: draft.variablePattern,
    },
    required_elements: draft.requiredElements,
    source_refs: {
      blueprintDraftId: draft.draftId,
      importBatchId: action.import_batch_id ?? null,
      reviewActionId: action.action_id,
      sourcePacketIds: draft.sourcePacketIds,
    },
    status: "approved",
    taxonomy_targets: draft.taxonomyTargets,
    title: draft.title,
    updated_by: reviewerId,
    version: 1,
  };
  const validation = validateQuestionBlueprintRow(blueprintRow);

  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }

  const exampleRow: QuestionBlueprintExampleRow = {
    asset_refs: draft.evidence.assetRefs,
    evidence_snippets: draft.evidence.boundedSnippets,
    source_kind: "import_batch",
    source_ref: {
      blueprintDraftId: draft.draftId,
      importBatchId: action.import_batch_id ?? null,
      reviewActionId: action.action_id,
    },
  };
  const quality = validateQuestionBlueprintQuality({
    blueprint: blueprintRow,
    evidenceSnippets: exampleRow.evidence_snippets,
    knownAssignableTagIds,
  });

  if (!quality.approvalReady) {
    throw new Error(
      formatBlueprintQualityError({
        heading: "Blueprint is not approval-ready:",
        reasons: quality.approvalBlockingReasons,
      }),
    );
  }

  return {
    blueprintRow,
    exampleRow,
  };
}

export function buildQuestionBlueprintRowsFromApprovedActions({
  actions,
  knownAssignableTagIds,
  reviewerId,
}: {
  actions: StoredQuestionBlueprintReviewAction[];
  knownAssignableTagIds?: ReadonlySet<string>;
  reviewerId: string;
}) {
  return actions
    .filter(
      (action) =>
        action.status === "approved" &&
        action.action_kind === "approve_blueprint",
    )
    .map((action) =>
      buildQuestionBlueprintRowFromAction({
        action,
        knownAssignableTagIds,
        reviewerId,
      }),
    );
}

export function buildQuestionBlueprintLibrarySeedPlan({
  existingBlueprintCount = 0,
  pendingReviewActionCount = 0,
  sourceImportBatchCount = 0,
}: {
  existingBlueprintCount?: number;
  pendingReviewActionCount?: number;
  sourceImportBatchCount?: number;
}) {
  return {
    existingBlueprintCount,
    mode: "admin_review_only" as const,
    pendingReviewActionCount,
    sourceImportBatchCount,
    warnings: [
      "question_blueprint_library_seed_plan_admin_only",
      "question_blueprint_library_seed_plan_no_question_generation",
      "question_blueprint_library_seed_plan_no_review_draft_write",
      "question_blueprint_library_seed_plan_no_provider_call",
    ],
  };
}

export async function persistApprovedQuestionBlueprints({
  actionIds,
  knownAssignableTagIds,
  reviewerId,
  supabase,
}: {
  actionIds: string[];
  knownAssignableTagIds?: ReadonlySet<string>;
  reviewerId: string;
  supabase: SupabaseLike;
}) {
  const ids = uniqueStrings(actionIds);

  if (!ids.length) {
    throw new Error("No blueprint review actions were selected.");
  }

  const { data: rows, error: loadError } = await supabase
    .from("question_blueprint_review_actions")
    .select("*")
    .in("id", ids);

  if (loadError) {
    throw new Error(loadError.message);
  }

  const actions = ((rows ?? []) as StoredQuestionBlueprintReviewAction[]).filter(
    (action) => action.status === "pending_review",
  );

  if (!actions.length) {
    throw new Error("No pending blueprint review actions were found.");
  }

  const createdBlueprintIds: string[] = [];

  for (const action of actions) {
    const approvedAction = {
      ...action,
      status: "approved" as const,
    };
    const { blueprintRow, exampleRow } = buildQuestionBlueprintRowFromAction({
      action: approvedAction,
      knownAssignableTagIds,
      reviewerId,
    });
    const { data: blueprint, error: blueprintError } = await supabase
      .from("question_blueprints")
      .insert(blueprintRow)
      .select("id")
      .single();

    if (blueprintError) {
      throw new Error(blueprintError.message);
    }

    if (!blueprint?.id) {
      throw new Error("Blueprint insert did not return an id.");
    }

    createdBlueprintIds.push(String(blueprint.id));

    const { error: exampleError } = await supabase
      .from("question_blueprint_examples")
      .insert({
        ...exampleRow,
        blueprint_id: blueprint.id,
      });

    if (exampleError) {
      throw new Error(exampleError.message);
    }

    const { error: updateError } = await supabase
      .from("question_blueprint_review_actions")
      .update({
        reviewer_id: reviewerId,
        reviewed_at: new Date().toISOString(),
        status: "approved",
        updated_by: reviewerId,
      })
      .eq("id", action.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  return {
    createdBlueprintIds,
    createdCount: createdBlueprintIds.length,
  };
}

export function summarizeQuestionBlueprintLibrary({
  approvedBlueprintCount = 0,
  pendingReviewActionCount = 0,
  rejectedReviewActionCount = 0,
}: {
  approvedBlueprintCount?: number;
  pendingReviewActionCount?: number;
  rejectedReviewActionCount?: number;
}) {
  return {
    approvedBlueprintCount,
    pendingReviewActionCount,
    rejectedReviewActionCount,
  };
}
