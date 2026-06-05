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

type SupabaseLike = {
  from: (table: string) => any;
};

export type BatchImportSummary = {
  batchId: string | null;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  duplicateCount: number;
  validCount: number;
  invalidCount: number;
  unknownTagCount: number;
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

async function loadImportContext(supabase: SupabaseLike) {
  const [{ data: tags, error: tagsError }, { data: questions, error: questionsError }] =
    await Promise.all([
      supabase
        .from("tags")
        .select("id, name, slug")
        .eq("status", "published")
        .limit(1000),
      supabase.from("questions").select("question_code").limit(5000),
    ]);

  if (tagsError) {
    throw new Error(tagsError.message);
  }

  if (questionsError) {
    throw new Error(questionsError.message);
  }

  const loadedTags = (tags ?? []) as { id: string; name: string; slug: string }[];
  const loadedQuestions = (questions ?? []) as { question_code: string }[];

  return {
    tags: loadedTags,
    questionCodes: new Set(
      loadedQuestions.map((question) => question.question_code.toLowerCase()),
    ),
  };
}

export async function previewBatchImportJson({
  supabase,
  jsonText,
}: {
  supabase: SupabaseLike;
  jsonText: string;
}): Promise<BatchImportPreview> {
  const rawItems = parseBatchImportJson(jsonText);
  const context = await loadImportContext(supabase);

  return evaluateBatchImportItems({
    rawItems,
    existingTags: context.tags,
    existingQuestionCodes: context.questionCodes,
  });
}

export async function importBatchImportJson({
  supabase,
  profileId,
  jsonText,
}: {
  supabase: SupabaseLike;
  profileId: string;
  jsonText: string;
}): Promise<BatchImportSummary> {
  const preview = await previewBatchImportJson({ supabase, jsonText });
  const initialSummary = {
    createdCount: 0,
    skippedCount: preview.invalidCount,
    errorCount: preview.invalidCount,
    duplicateCount: preview.duplicateCount,
    validCount: preview.validCount,
    invalidCount: preview.invalidCount,
    unknownTagCount: preview.unknownTagCount,
    createdQuestions: [],
  };
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      source_type: "manual_json",
      status: "validating",
      summary: initialSummary,
      created_by: profileId,
    })
    .select("id")
    .single();

  if (batchError) {
    throw new Error(batchError.message);
  }

  const batchId = batch.id as string;

  if (preview.items.length) {
    const { error: itemsError } = await supabase.from("import_batch_items").insert(
      preview.items.map((item) => ({
        batch_id: batchId,
        item_index: item.index,
        raw_payload: item.raw,
        normalized_question_json: item.normalized,
        validation_errors: [...item.errors, ...item.warnings],
        status: item.normalized ? "valid" : "invalid",
      })),
    );

    if (itemsError) {
      throw new Error(itemsError.message);
    }
  }

  let createdCount = 0;
  let skippedCount = preview.invalidCount;
  let errorCount = preview.invalidCount;
  const createdQuestions: BatchImportSummary["createdQuestions"] = [];

  for (const item of preview.items) {
    if (!item.normalized) {
      continue;
    }

    const normalized = item.normalized;
    const { data: question, error: questionError } = await supabase
      .from("questions")
      .insert({
        question_code: normalized.question_code,
        title: normalized.title,
        content_html: normalized.content_html,
        content_source: normalized.content_source,
        content_source_format: normalized.content_source_format,
        solution_html: normalized.solution_html,
        solution_source: normalized.solution_source,
        solution_source_format: normalized.solution_source_format,
        difficulty_rating: normalized.difficulty_rating,
        question_type: normalized.question_type,
        status: "draft",
        created_by: profileId,
        updated_by: profileId,
      })
      .select("id")
      .single();

    if (questionError) {
      skippedCount += 1;
      errorCount += 1;
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
        .eq("batch_id", batchId)
        .eq("item_index", item.index);
      continue;
    }

    if (normalized.tag_ids.length) {
      const { error: tagsError } = await supabase.from("question_tags").insert(
        normalized.tag_ids.map((tagId) => ({
          question_id: question.id,
          tag_id: tagId,
        })),
      );

      if (tagsError) {
        skippedCount += 1;
        errorCount += 1;
        await supabase.from("questions").delete().eq("id", question.id);
        await supabase
          .from("import_batch_items")
          .update({
            status: "skipped",
            validation_errors: [...item.errors, ...item.warnings, tagsError.message],
          })
          .eq("batch_id", batchId)
          .eq("item_index", item.index);
        continue;
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
      .eq("batch_id", batchId)
      .eq("item_index", item.index);
  }

  const finalSummary = {
    batchId,
    createdCount,
    skippedCount,
    errorCount,
    duplicateCount: preview.duplicateCount,
    validCount: preview.validCount,
    invalidCount: preview.invalidCount,
    unknownTagCount: preview.unknownTagCount,
    createdQuestions,
  };
  const { error: batchUpdateError } = await supabase
    .from("import_batches")
    .update({
      status: errorCount > 0 ? "failed" : "imported",
      summary: finalSummary,
    })
    .eq("id", batchId);

  if (batchUpdateError) {
    throw new Error(batchUpdateError.message);
  }

  return finalSummary;
}
