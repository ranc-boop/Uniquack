import {
  type BatchImportPreview,
  evaluateBatchImportItems,
  parseBatchImportJson,
} from "@/lib/batch-import/json";
import {
  countImportAssetReferences,
  extractImportAssetReferences,
  type ImportAssetReferences,
} from "@/lib/batch-import/asset-references";
import type { AIProviderJobPersistenceFence } from "@/lib/ai-jobs/checkpoint";

type SupabaseLike = {
  from: (table: string) => any;
  // New forward-only worker RPCs are intentionally not in generated types
  // until the migration has been applied and types are regenerated.
  rpc?: any;
};

const MISSING_ORGANIZATION_MESSAGE =
  "No active organization found for AI import. Please check your profile or organization membership.";

function asSummaryRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type ImportTargetBankContext = {
  bankId: string;
  visibility: "private" | "shared" | "organization" | "public";
};

async function loadImportBatchSummary({
  batchId,
  supabase,
}: {
  batchId: string;
  supabase: SupabaseLike;
}) {
  const { data, error } = await supabase
    .from("import_batches")
    .select("summary")
    .eq("id", batchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return asSummaryRecord(data?.summary);
}

export async function resolveImportOrganizationContext({
  batchId,
  existingOrganizationId,
  profileId,
  supabase,
}: {
  batchId?: string | null;
  existingOrganizationId?: string | null;
  profileId: string;
  supabase: SupabaseLike;
}) {
  const batchOrganizationId = asString(existingOrganizationId);

  if (batchOrganizationId) {
    return {
      organizationId: batchOrganizationId,
      source: "import_batches.organization_id",
    };
  }

  if (batchId) {
    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .select("organization_id")
      .eq("id", batchId)
      .maybeSingle();

    if (batchError) {
      throw new Error(batchError.message);
    }

    const organizationId = asString(batch?.organization_id);

    if (organizationId) {
      return {
        organizationId,
        source: "import_batches.organization_id",
      };
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("default_organization_id")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profileOrganizationId = asString(profile?.default_organization_id);

  if (profileOrganizationId) {
    return {
      organizationId: profileOrganizationId,
      source: "profiles.default_organization_id",
    };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role, status, created_at")
    .eq("user_id", profileId)
    .eq("status", "active")
    .in("role", ["admin", "teacher"])
    .order("role", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const membershipOrganizationId = asString(memberships?.[0]?.organization_id);

  if (membershipOrganizationId) {
    return {
      organizationId: membershipOrganizationId,
      source: "organization_members.active_staff_membership",
    };
  }

  throw new Error(MISSING_ORGANIZATION_MESSAGE);
}

async function resolveImportTargetBankContext({
  organizationId,
  supabase,
  targetBankId,
}: {
  organizationId: string;
  supabase: SupabaseLike;
  targetBankId?: string | null;
}): Promise<ImportTargetBankContext | null> {
  const bankId = asString(targetBankId);

  if (!bankId) {
    return null;
  }

  const { data: bank, error } = await supabase
    .from("question_banks")
    .select("id, organization_id, visibility, status")
    .eq("id", bankId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!bank || bank.status !== "active") {
    throw new Error("Target Library was not found or is not active.");
  }

  if (bank.organization_id !== organizationId) {
    throw new Error("Target Library belongs to a different organization.");
  }

  return {
    bankId: bank.id,
    visibility: bank.visibility,
  };
}

export type BatchImportSummary = {
  batchId: string | null;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  duplicateCount: number;
  validCount: number;
  invalidCount: number;
  unknownTagCount: number;
  validationErrorReasons: string[];
  createdQuestions: {
    id: string;
    assetReferences: ImportAssetReferences;
    assetReferenceCounts: {
      imageUrls: number;
      sourceFileIds: number;
      questionAssetIds: number;
      total: number;
    };
    questionCode: string;
    title: string;
  }[];
};

type ImportBatchSourceType =
  | "manual_json"
  | "manual_csv"
  | "ai_pdf"
  | "ai_image"
  | "ai_word"
  | "package"
  | "course_builder";

function requiredQuestionSourceText(value: string | null | undefined) {
  return typeof value === "string" ? value : "";
}

function questionSourceKindForImport(sourceType: ImportBatchSourceType) {
  return sourceType === "ai_pdf" ||
    sourceType === "ai_image" ||
    sourceType === "ai_word"
    ? "ai_import"
    : "package_import";
}

function questionSourceLabelForImport({
  batchId,
  sourceType,
}: {
  batchId: string;
  sourceType: ImportBatchSourceType;
}) {
  const prefix =
    sourceType === "ai_pdf"
      ? "ai_pdf_import"
      : sourceType === "ai_image"
        ? "ai_image_import"
        : sourceType === "ai_word"
          ? "ai_word_import"
          : sourceType;

  return `${prefix}:${batchId}`;
}

async function loadImportContext({
  allowDraftTags = false,
  supabase,
}: {
  allowDraftTags?: boolean;
  supabase: SupabaseLike;
}) {
  const tagQuery = supabase
    .from("taxonomy_nodes")
    .select("tag_id, label, status")
    .eq("is_assignable", true)
    // perf-budget-allow-large-query: batch import validation needs the bounded active assignable taxonomy catalog.
    .limit(1000);
  const filteredTagQuery = allowDraftTags
    ? tagQuery.neq("status", "archived")
    : tagQuery.eq("status", "active");
  const [{ data: tags, error: tagsError }, { data: questions, error: questionsError }] =
    await Promise.all([
      filteredTagQuery,
      supabase.from("questions").select("question_code").limit(5000),
    ]);

  if (tagsError) {
    throw new Error(tagsError.message);
  }

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const loadedTags = ((tags ?? []) as {
    tag_id: string;
  }[]).map((tag) => ({
    id: tag.tag_id,
  }));
  const loadedQuestions = (questions ?? []) as { question_code: string }[];

  return {
    tags: loadedTags,
    questionCodes: new Set(
      loadedQuestions.map((question) => question.question_code.toLowerCase()),
    ),
  };
}

export async function previewBatchImportJson({
  allowDraftTags = false,
  supabase,
  jsonText,
}: {
  allowDraftTags?: boolean;
  supabase: SupabaseLike;
  jsonText: string;
}): Promise<BatchImportPreview> {
  const rawItems = parseBatchImportJson(jsonText);
  const context = await loadImportContext({ allowDraftTags, supabase });

  return evaluateBatchImportItems({
    rawItems,
    existingTags: context.tags,
    existingQuestionCodes: context.questionCodes,
  });
}

export async function importBatchImportJson({
  allowDraftTags = false,
  batchId: providedBatchId,
  deferFinalization = false,
  initialSummaryExtras = {},
  itemIndexOffset = 0,
  supabase,
  profileId,
  persistenceFence,
  persistenceLineageKey,
  jsonText,
  sourceType = "manual_json",
  targetBankId,
}: {
  allowDraftTags?: boolean;
  batchId?: string;
  deferFinalization?: boolean;
  initialSummaryExtras?: Record<string, unknown>;
  itemIndexOffset?: number;
  persistenceFence?: AIProviderJobPersistenceFence;
  supabase: SupabaseLike;
  profileId: string;
  persistenceLineageKey?: string;
  jsonText: string;
  sourceType?: ImportBatchSourceType;
  targetBankId?: string | null;
}): Promise<BatchImportSummary> {
  const normalizedPersistenceLineageKey = persistenceLineageKey?.trim().toLowerCase() || null;
  if (
    normalizedPersistenceLineageKey &&
    !/^[a-z0-9:_-]{16,200}$/.test(normalizedPersistenceLineageKey)
  ) {
    throw new Error("Import persistence lineage is invalid.");
  }
  const preview = await previewBatchImportJson({
    allowDraftTags,
    supabase,
    jsonText,
  });
  const validationErrorReasons = Array.from(
    new Set(
      preview.items
        .flatMap((item) => item.errors)
        .map((error) => error.trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
  const initialSummary = {
    createdCount: 0,
    skippedCount: preview.invalidCount,
    errorCount: preview.invalidCount,
    duplicateCount: preview.duplicateCount,
    validCount: preview.validCount,
    invalidCount: preview.invalidCount,
    unknownTagCount: preview.unknownTagCount,
    validationErrorReasons,
    createdQuestions: [],
  };
  const batchId = providedBatchId ?? null;
  let activeBatchId = batchId;
  let organizationContext: Awaited<
    ReturnType<typeof resolveImportOrganizationContext>
  >;
  let targetBankContext: ImportTargetBankContext | null = null;

  if (activeBatchId) {
    const { data: existingBatch, error: existingBatchError } = await supabase
      .from("import_batches")
      .select("summary, organization_id, target_bank_id")
      .eq("id", activeBatchId)
      .maybeSingle();

    if (existingBatchError) {
      throw new Error(existingBatchError.message);
    }

    if (!existingBatch) {
      throw new Error("Import batch was not found.");
    }

    organizationContext = await resolveImportOrganizationContext({
      batchId: activeBatchId,
      existingOrganizationId: existingBatch.organization_id,
      profileId,
      supabase,
    });
    const resolvedTargetBankId =
      targetBankId ?? existingBatch.target_bank_id ?? null;
    targetBankContext = await resolveImportTargetBankContext({
      organizationId: organizationContext.organizationId,
      supabase,
      targetBankId: resolvedTargetBankId,
    });
    if (
      targetBankContext &&
      existingBatch.target_bank_id &&
      existingBatch.target_bank_id !== targetBankContext.bankId
    ) {
      throw new Error("Existing import batch is scoped to a different Library.");
    }
    if (!persistenceFence) {
      const existingSummary = asSummaryRecord(existingBatch.summary);
      const { error: batchUpdateError } = await supabase
        .from("import_batches")
        .update({
          organization_id:
            existingBatch.organization_id ?? organizationContext.organizationId,
          status: "validating",
          target_bank_id: targetBankContext?.bankId ?? existingBatch.target_bank_id ?? null,
          summary: {
            ...existingSummary,
            ...initialSummary,
            ...initialSummaryExtras,
            ...(targetBankContext
              ? {
                  targetBankId: targetBankContext.bankId,
                  reviewScope: "question_bank",
                }
              : {}),
          },
        })
        .eq("id", activeBatchId);

      if (batchUpdateError) {
        throw new Error(batchUpdateError.message);
      }
    }
  } else {
    organizationContext = await resolveImportOrganizationContext({
      profileId,
      supabase,
    });
    targetBankContext = await resolveImportTargetBankContext({
      organizationId: organizationContext.organizationId,
      supabase,
      targetBankId,
    });
    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        organization_id: organizationContext.organizationId,
        source_type: sourceType,
        status: "validating",
        target_bank_id: targetBankContext?.bankId ?? null,
        summary: {
          ...initialSummary,
          ...initialSummaryExtras,
          ...(targetBankContext
            ? {
                targetBankId: targetBankContext.bankId,
                reviewScope: "question_bank",
              }
            : {}),
        },
        created_by: profileId,
      })
      .select("id")
      .single();

    if (batchError) {
      throw new Error(batchError.message);
    }

    activeBatchId = batch.id as string;
  }

  if (!activeBatchId) {
    throw new Error("Import batch was not initialized.");
  }

  if (persistenceFence) {
    if (!supabase.rpc) {
      throw new Error("Fenced import persistence requires the trusted RPC client.");
    }

    let fencedCreatedCount = 0;
    let fencedSkippedCount = preview.invalidCount;
    let fencedErrorCount = preview.invalidCount;
    const fencedCreatedQuestions: BatchImportSummary["createdQuestions"] = [];

    for (const item of preview.items) {
      const normalized = item.normalized;
      const itemIndex = item.index + itemIndexOffset;
      const itemLineageKey = normalizedPersistenceLineageKey
        ? `${normalizedPersistenceLineageKey}:item:${itemIndex}`
        : null;
      if (!itemLineageKey) {
        throw new Error("Fenced import persistence requires a deterministic lineage key.");
      }

      const { data, error } = await supabase.rpc(
        "persist_ai_provider_job_import_item_fenced",
        {
          p_execution_fence_token: persistenceFence.executionFenceToken,
          p_item_index: itemIndex,
          p_job_id: persistenceFence.jobId,
          p_lease_owner: persistenceFence.leaseOwner,
          p_normalized_question_json: normalized,
          p_persistence_lineage_key: itemLineageKey,
          p_raw_payload: item.raw,
          p_source_type: sourceType,
          p_validation_errors: [...item.errors, ...item.warnings],
          p_visibility: "private",
        },
      );
      if (error) throw new Error(error.message);

      const result = asSummaryRecord(data);
      if (result.outcome === "STALE_FENCE_REJECTED") {
        throw new Error("STALE_FENCE_REJECTED");
      }
      if (!normalized || result.outcome === "INVALID") {
        continue;
      }

      const questionId = asString(result.questionId);
      if (!questionId) {
        fencedSkippedCount += 1;
        fencedErrorCount += 1;
        continue;
      }

      fencedCreatedCount += 1;
      const assetReferences = extractImportAssetReferences(normalized);
      fencedCreatedQuestions.push({
        id: questionId,
        assetReferences,
        assetReferenceCounts: countImportAssetReferences(assetReferences),
        questionCode: normalized.question_code,
        title: normalized.title,
      });
    }

    const fencedSummary = {
      batchId: activeBatchId,
      createdCount: fencedCreatedCount,
      skippedCount: fencedSkippedCount,
      errorCount: fencedErrorCount,
      duplicateCount: preview.duplicateCount,
      validCount: preview.validCount,
      invalidCount: preview.invalidCount,
      unknownTagCount: preview.unknownTagCount,
      validationErrorReasons,
      createdQuestions: fencedCreatedQuestions,
    };
    if (!deferFinalization) {
      const existingSummaryBeforeFinal = await loadImportBatchSummary({
        batchId: activeBatchId,
        supabase,
      });
      const { error: finalizeError } = await supabase.rpc(
        "finalize_ai_provider_job_import_batch_fenced",
        {
          p_execution_fence_token: persistenceFence.executionFenceToken,
          p_job_id: persistenceFence.jobId,
          p_lease_owner: persistenceFence.leaseOwner,
          p_persisted_output_lineage: {
            contractVersion: 1,
            logicalItemCount: preview.items.length,
            persistenceLineageKey: normalizedPersistenceLineageKey,
          },
          p_status: fencedErrorCount > 0 ? "failed" : "imported",
          p_summary: {
            ...existingSummaryBeforeFinal,
            ...fencedSummary,
            ...initialSummaryExtras,
          },
        },
      );
      if (finalizeError) throw new Error(finalizeError.message);
    }

    return fencedSummary;
  }

  if (preview.items.length) {
    const itemRows = preview.items.map((item) => ({
      batch_id: activeBatchId,
      item_index: item.index + itemIndexOffset,
      raw_payload: item.raw,
      normalized_question_json: item.normalized,
      persistence_lineage_key: normalizedPersistenceLineageKey
        ? `${normalizedPersistenceLineageKey}:item:${item.index + itemIndexOffset}`
        : null,
      validation_errors: [...item.errors, ...item.warnings],
      status: item.normalized ? "valid" : "invalid",
    }));
    const { error: itemsError } = normalizedPersistenceLineageKey
      ? await supabase
          .from("import_batch_items")
          .upsert(itemRows, {
            ignoreDuplicates: true,
            onConflict: "batch_id,persistence_lineage_key",
          })
      : await supabase.from("import_batch_items").insert(itemRows);

    if (itemsError) {
      throw new Error(itemsError.message);
    }
  }

  let createdCount = 0;
  let skippedCount = preview.invalidCount;
  let errorCount = preview.invalidCount;
  const runtimeErrorReasons = new Set<string>();
  const createdQuestions: BatchImportSummary["createdQuestions"] = [];

  for (const item of preview.items) {
    if (!item.normalized) {
      continue;
    }

    const normalized = item.normalized;
    const persistenceItemKey = normalizedPersistenceLineageKey
      ? `${normalizedPersistenceLineageKey}:item:${item.index + itemIndexOffset}`
      : null;
    let reusedQuestion = false;
    let question: { id: string } | null = null;

    if (persistenceItemKey) {
      const { data: existingItem, error: existingItemError } = await supabase
        .from("import_batch_items")
        .select("created_question_id, status")
        .eq("batch_id", activeBatchId)
        .eq("persistence_lineage_key", persistenceItemKey)
        .maybeSingle();
      if (existingItemError) throw new Error(existingItemError.message);

      if (existingItem?.created_question_id) {
        const { data: existingQuestion, error: existingQuestionError } = await supabase
          .from("questions")
          .select("id")
          .eq("id", existingItem.created_question_id)
          .maybeSingle();
        if (existingQuestionError) throw new Error(existingQuestionError.message);
        if (existingQuestion) {
          question = existingQuestion;
          reusedQuestion = true;
        }
      }
    }

    if (!question) {
      const { data: insertedQuestion, error: questionError } = await supabase
      .from("questions")
      .insert({
        organization_id: organizationContext.organizationId,
        question_code: normalized.question_code,
        title: normalized.title,
        content_html: normalized.content_html,
        content_source: requiredQuestionSourceText(normalized.content_source),
        content_source_format: normalized.content_source_format,
        solution_html: normalized.solution_html,
        solution_source: requiredQuestionSourceText(normalized.solution_source),
        solution_source_format: normalized.solution_source_format,
        answer_spec: normalized.answer_spec,
        difficulty_rating: normalized.difficulty_rating,
        options: normalized.options,
        owner_bank_id: targetBankContext?.bankId ?? null,
        question_type: normalized.question_type,
        source: questionSourceLabelForImport({
          batchId: activeBatchId,
          sourceType,
        }),
        source_kind: questionSourceKindForImport(sourceType),
        status: "draft",
        created_by: profileId,
        updated_by: profileId,
        visibility: "private",
      })
      .select("id")
      .single();

      question = insertedQuestion;
      if (questionError && persistenceItemKey && questionError.code === "23505") {
        const { data: existingQuestion, error: existingQuestionError } = await supabase
          .from("questions")
          .select("id")
          .eq("question_code", normalized.question_code)
          .eq(
            "source",
            questionSourceLabelForImport({ batchId: activeBatchId, sourceType }),
          )
          .maybeSingle();
        if (existingQuestionError) throw new Error(existingQuestionError.message);
        if (existingQuestion) {
          question = existingQuestion;
          reusedQuestion = true;
        }
      }

      if (questionError && !question) {
      skippedCount += 1;
      errorCount += 1;
      runtimeErrorReasons.add(questionError.message);
      await supabase
        .from("import_batch_items")
        .update({
          status: "skipped",
          validation_errors: [
            ...item.errors,
            ...item.warnings,
            questionError.message,
          ],
        })
        .eq("batch_id", activeBatchId)
        .eq("item_index", item.index + itemIndexOffset);
      continue;
      }
    }

    if (!question) {
      throw new Error("Import question persistence did not return a stable question reference.");
    }

    if (normalized.tag_ids.length) {
      let tagIdsToInsert = normalized.tag_ids;
      if (reusedQuestion) {
        const { data: existingTags, error: existingTagsError } = await supabase
          .from("question_taxonomy_assignments")
          .select("tag_id")
          .eq("question_id", question.id);
        if (existingTagsError) throw new Error(existingTagsError.message);
        const existingTagIds = new Set((existingTags ?? []).map((tag: { tag_id: string }) => tag.tag_id));
        tagIdsToInsert = normalized.tag_ids.filter((tagId) => !existingTagIds.has(tagId));
      }
      if (!tagIdsToInsert.length) {
        // A recovery replay must not append duplicate pending-review tags.
      } else {
      const { error: tagsError } = await supabase
        .from("question_taxonomy_assignments")
        .insert(
        tagIdsToInsert.map((tagId) => ({
          question_id: question.id,
          tag_id: tagId,
          review_status: "pending_review",
          source: "batch_import",
        })),
      );

      if (tagsError) {
        skippedCount += 1;
        errorCount += 1;
        runtimeErrorReasons.add(tagsError.message);
        if (!reusedQuestion) {
          await supabase.from("questions").delete().eq("id", question.id);
        }
        await supabase
          .from("import_batch_items")
          .update({
            status: "skipped",
          validation_errors: [...item.errors, ...item.warnings, tagsError.message],
        })
        .eq("batch_id", activeBatchId)
        .eq("item_index", item.index + itemIndexOffset);
      continue;
    }
      }
    }

    createdCount += 1;
    const assetReferences = extractImportAssetReferences(normalized);
    createdQuestions.push({
      id: question.id,
      assetReferences,
      assetReferenceCounts: countImportAssetReferences(assetReferences),
      questionCode: normalized.question_code,
      title: normalized.title,
    });
    await supabase
      .from("import_batch_items")
      .update({
        status: "imported",
        created_question_id: question.id,
      })
      .eq("batch_id", activeBatchId)
      .eq("item_index", item.index + itemIndexOffset);
  }

  const finalSummary = {
    batchId: activeBatchId,
    createdCount,
    skippedCount,
    errorCount,
    duplicateCount: preview.duplicateCount,
    validCount: preview.validCount,
    invalidCount: preview.invalidCount,
    unknownTagCount: preview.unknownTagCount,
    validationErrorReasons: Array.from(
      new Set([...validationErrorReasons, ...runtimeErrorReasons]),
    ).slice(0, 8),
    createdQuestions,
  };
  const existingSummaryBeforeFinal = await loadImportBatchSummary({
    batchId: activeBatchId,
    supabase,
  });
  const { error: batchUpdateError } = await supabase
    .from("import_batches")
    .update({
      status: errorCount > 0 ? "failed" : "imported",
      summary: {
        ...existingSummaryBeforeFinal,
        ...finalSummary,
      },
    })
    .eq("id", activeBatchId);

  if (batchUpdateError) {
    throw new Error(batchUpdateError.message);
  }

  return finalSummary;
}
