import { callAIPdfExtractionProvider } from "@/lib/ai-providers/chat";
import {
  AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE,
  describeAiPdfProviderInput,
  supportsAIPdfSequentialChunkExtraction,
  type AiPdfInputStrategy,
} from "@/lib/ai-providers/adapters";
import {
  loadAIProviderProfileForUse,
  loadSafeAIProviderProfileForUse,
} from "@/lib/ai-providers/profiles";
import {
  cropPdfPlaceholderImage,
  getPdfPageCount,
  renderPdfPages,
  type RenderedPage,
} from "@/lib/ai-pdf-import/pdf";
import {
  AI_PDF_IMPORT_MAX_BYTES,
  AI_PDF_IMPORT_MAX_PAGES,
} from "@/lib/ai-pdf-import/constants";
import {
  formatAIPdfChunkPageRange,
  mergeAIPdfImportChunkingSummary,
  normalizeAIPdfChunkingSummary,
  patchAIPdfChunkingSummary,
  type AIPdfImportChunkSummary,
} from "@/lib/ai-pdf-import/chunking";
import {
  generateAIPdfQuestionCodeForImport,
  questionCodeKey,
  visibleQuestionNumberKey,
} from "@/lib/ai-pdf-import/question-code";
import {
  normalizeAIPdfExtractionResponse,
  type AIPdfAssetPlaceholder,
  type AIPdfExtraction,
  type AIPdfQuestion,
} from "@/lib/ai-pdf-import/schema";
import {
  failedPdfPreanalysis,
  generatePdfPreanalysis,
  mergeAIPreanalysisIntoSummary,
  type AIPreanalysisResult,
} from "@/lib/ai-pdf-import/preanalysis";
import { importBatchImportJson } from "@/lib/batch-import/service";
import { markdownLatexToHtml } from "@/lib/markdown-latex/markdown";
import {
  QUESTION_ASSETS_BUCKET,
  QUESTION_ASSET_MAX_BYTES,
} from "@/lib/question-assets";
import { sanitizeContentHtml } from "@/lib/sanitize/html";

type SupabaseLike = {
  from: (table: string) => any;
  storage: any;
};

type ActiveTag = {
  id: string;
  name: string;
  slug: string;
  status: string;
  tag_type: string;
};

type ProcessInput = {
  batchId: string;
  chunkIndex?: number;
  fileName: string;
  jobId?: string;
  pdfBuffer: Buffer;
  profileId: string;
  providerProfileId: string;
  sourceAssetId?: string;
  sourceObjectPath: string;
  supabase: SupabaseLike;
};

type AIPdfProgress = {
  detail?: string;
  error?: string;
  pageCount?: number;
  phase: string;
  provider?: { id: string; model: string; name: string; provider: string };
  questionCount?: number;
  sourceInput?: AiPdfInputStrategy;
  warnings?: string[];
};

function plainObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberFromRecord(
  record: Record<string, unknown>,
  keys: string[],
  fallback = 0,
) {
  for (const key of keys) {
    const value = record[key];
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return fallback;
}

function createdQuestionsFromSummary(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => plainObject(item))
    .filter(
      (item) =>
        typeof item.id === "string" &&
        typeof item.questionCode === "string" &&
        typeof item.title === "string",
    )
    .map((item) => ({
      assetReferenceCounts: plainObject(item.assetReferenceCounts) as {
        imageUrls: number;
        questionAssetIds: number;
        sourceFileIds: number;
        total: number;
      },
      assetReferences: item.assetReferences,
      id: String(item.id),
      questionCode: String(item.questionCode),
      title: String(item.title),
    }));
}

async function loadCurrentAIPdfSummary(input: ProcessInput) {
  const { data: batch, error } = await input.supabase
    .from("import_batches")
    .select("summary")
    .eq("id", input.batchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const currentSummary = plainObject(batch?.summary);

  return {
    aiPdfImport: plainObject(currentSummary.aiPdfImport),
    summary: currentSummary,
  };
}

async function updateAIPdfBatchProgress(
  input: ProcessInput,
  progress: AIPdfProgress,
) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
    fileName: input.fileName,
    jobId: input.jobId,
    sourceAssetId: input.sourceAssetId,
    sourceObjectPath: input.sourceObjectPath,
    updatedAt: new Date().toISOString(),
    ...progress,
  });
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIPdfChunkProgress({
  chunk,
  input,
  pageCount,
  patch,
  progress = {},
}: {
  chunk: AIPdfImportChunkSummary;
  input: ProcessInput;
  pageCount: number;
  patch: Partial<AIPdfImportChunkSummary>;
  progress?: Partial<AIPdfProgress>;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const chunking = patchAIPdfChunkingSummary({
    chunkIndex: chunk.chunkIndex,
    pageCount,
    patch: {
      sourcePages: chunk.sourcePages,
      ...patch,
    },
    value: current.aiPdfImport.chunking,
  });
  const aiPdfImport = mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
    fileName: input.fileName,
    jobId: input.jobId,
    pageCount,
    sourceAssetId: input.sourceAssetId,
    sourceObjectPath: input.sourceObjectPath,
    updatedAt: new Date().toISOString(),
    ...progress,
    chunking,
  });
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAIPdfPreanalysis({
  input,
  preanalysis,
}: {
  input: ProcessInput;
  preanalysis: AIPreanalysisResult;
}) {
  const current = await loadCurrentAIPdfSummary(input);
  const aiPdfImport = mergeAIPreanalysisIntoSummary(
    mergeAIPdfImportChunkingSummary(current.aiPdfImport, {
      fileName: input.fileName,
      jobId: input.jobId,
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      updatedAt: new Date().toISOString(),
    }),
    preanalysis,
  );
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        ...current.summary,
        aiPdfImport,
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }
}

async function generateAndStorePdfPreanalysis({
  input,
  pageCount,
}: {
  input: ProcessInput;
  pageCount: number;
}) {
  await updateAIPdfBatchProgress(input, {
    detail: "Analyzing PDF structure before AI extraction.",
    pageCount,
    phase: "preanalyzing_source",
  });

  try {
    const preanalysis = await generatePdfPreanalysis({
      pageCount,
      pdfBuffer: input.pdfBuffer,
    });
    await updateAIPdfPreanalysis({ input, preanalysis });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "PDF preanalysis failed.";
    await updateAIPdfPreanalysis({
      input,
      preanalysis: failedPdfPreanalysis({
        error: message,
        pageCount,
      }),
    });
  }
}

function stripHtml(value: string | null | undefined) {
  return value?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function simpleHtmlToMarkdownSource(value: string | null | undefined) {
  const html = value?.trim();

  if (!html) {
    return "";
  }

  const withoutSimpleBlocks = html
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|span|strong|b|em|i)[^>]*>/gi, "")
    .trim();

  if (/<[a-z][\s\S]*>/i.test(withoutSimpleBlocks)) {
    return "";
  }

  return decodeBasicHtmlEntities(withoutSimpleBlocks)
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function hasLatexSignal(value: string) {
  return /(?:\$|\\sqrt|\\frac|\\begin|\\left|\\right|\\int|\\sum|\\[a-zA-Z]+|\^|_)/.test(
    value,
  );
}

function balanceInlineDollarMath(value: string) {
  const withoutBlockDelimiters = value.replace(/\$\$/g, "");
  const dollarCount = (withoutBlockDelimiters.match(/\$/g) ?? []).length;

  if (dollarCount % 2 === 0) {
    return value;
  }

  const lastDollarIndex = value.lastIndexOf("$");
  const trailing = lastDollarIndex >= 0 ? value.slice(lastDollarIndex + 1) : "";

  return /[a-zA-Z\\^_=+\-*/()]/.test(trailing) ? `${value}$` : value;
}

function normalizeLatexSource(value: string) {
  return balanceInlineDollarMath(
    value
      .replace(/\\\(([\s\S]*?)\\\)/g, "$$$1$")
      .replace(/\\\[([\s\S]*?)\\\]/g, "$$$$\n$1\n$$$$")
      .trim(),
  );
}

function normalizeAITextFields({
  html,
  source,
}: {
  html: string | null | undefined;
  source: string | null | undefined;
}) {
  const simpleHtmlSource = simpleHtmlToMarkdownSource(html);
  const trimmedSource = source?.trim() ?? "";
  const preferredSource =
    simpleHtmlSource && (hasLatexSignal(simpleHtmlSource) || !trimmedSource)
      ? simpleHtmlSource
      : trimmedSource || simpleHtmlSource;

  if (!preferredSource) {
    return {
      html: html ?? "",
      source: "",
      sourceFormat: "html" as const,
    };
  }

  const normalizedSource = normalizeLatexSource(preferredSource);

  return {
    html: markdownLatexToHtml(normalizedSource),
    source: normalizedSource,
    sourceFormat: "markdown_latex" as const,
  };
}

function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function slugify(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || `ai-tag-${crypto.randomUUID().slice(0, 8)}`;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function loadExistingQuestionCodeKeys(supabase: SupabaseLike) {
  const existing = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("questions")
      .select("question_code")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as { question_code: string | null }[];

    for (const row of rows) {
      if (row.question_code) {
        existing.add(questionCodeKey(row.question_code));
      }
    }

    if (rows.length < pageSize) {
      break;
    }
  }

  return existing;
}

function buildPrompt({
  activeTags,
  chunk,
  fileName,
  pageCount,
}: {
  activeTags: ActiveTag[];
  chunk?: Pick<AIPdfImportChunkSummary, "pageEnd" | "pageStart">;
  fileName: string;
  pageCount: number;
}) {
  const tags = activeTags
    .map((tag) => `- ${tag.name} | slug=${tag.slug} | type=${tag.tag_type} | status=${tag.status}`)
    .join("\n");

  return [
    "You are importing a PDF question set into a question bank.",
    "Read the entire document context in order. Questions, solutions, and figures may continue across page boundaries; do not split one question only because it crosses pages.",
    "Return ONLY valid JSON. Do not wrap it in markdown.",
    "",
    `File: ${fileName}`,
    `Page count: ${pageCount}`,
    chunk
      ? [
          "",
          `Chunk page range: pages ${chunk.pageStart}-${chunk.pageEnd}.`,
          `You are extracting questions only from pages ${chunk.pageStart}-${chunk.pageEnd}.`,
          "Return questions found in this page range.",
          "Preserve visible question numbers only as question_number.",
          "Do not invent missing pages.",
          "Do not concatenate content from other chunks or guess cross-page continuations.",
        ].join("\n")
      : "",
    "",
    "Existing active tags. Reuse these by tag_slugs or tag_names when they are semantically appropriate. Create new tags only when none fit:",
    tags || "(none)",
    "",
    "JSON schema:",
    JSON.stringify({
      questions: [
        {
          asset_placeholders: [
            {
              alt: "short figure alt text",
              bbox: { height: 0.2, width: 0.4, x: 0.1, y: 0.2 },
              page: 1,
              placeholder: "{{asset:figure_1}}",
            },
          ],
          content_html: "<p>Question stem with {{asset:figure_1}} where the image belongs.</p>",
          content_source: "Editable Markdown + LaTeX source, same meaning as content_html. Use $...$ for inline math.",
          difficulty_rating: 500,
          new_tag_names: ["Only if no existing tag fits"],
          page_refs: [1, 2],
          question_number: "Visible source number such as 3, 3.1, 3(a), or FRQ 2. Omit if missing.",
          question_type: "frq",
          solution_html: "<p>Solution or explanation.</p>",
          solution_source: "Editable solution source.",
          tag_names: ["Existing tag name"],
          tag_slugs: ["existing-tag-slug"],
          title: "Short question title",
        },
      ],
      warnings: ["Any uncertainty about extraction."],
    }),
    "",
    "Rules:",
    "- content_html is required and must be sanitized-friendly HTML.",
    "- Prefer writing content_source and solution_source as clean Markdown + LaTeX. Use $...$ for inline math and $$ blocks for display math.",
    "- Do not put raw dollar-delimited math directly in content_html. If content_html contains math, use <span data-type=\"inline-math\" data-latex=\"x^2\">x^2</span> or <div data-type=\"block-math\" data-latex=\"x^2\">x^2</div>.",
    "- Never leave unmatched dollar signs. For blanks such as x =, write $x =$ with a closing dollar.",
    "- Convert common math text to LaTeX in source fields: sqrt(x) -> \\sqrt{x}, pi -> \\pi when mathematical, fractions -> \\frac{...}{...}.",
    "- If a figure, chart, graph, table image, or diagram is important to the question, create one asset_placeholders entry so the system can crop it and display it in the question image gallery.",
    "- If the image must appear at an exact inline position, also put the exact placeholder string inside content_html or solution_html at that location.",
    "- Inline placeholders are optional because cropped images are also attached as question_assets and shown below the question detail.",
    "- Use placeholder strings exactly like {{asset:figure_1}}. Do not alter braces, spacing, or capitalization.",
    "- Bboxes are normalized page coordinates from top-left, all values 0..1.",
    "- Use question_number only for the visible number from the PDF. Do not invent database question_code values; the server always generates those.",
    "- Do not normalize visible numbers aggressively: 3, 3.1, 3(a), and FRQ 2 are different display values.",
    "- Keep questions as draft-quality records for human review; do not invent answers when unsure.",
  ].join("\n");
}

async function loadActiveTags(supabase: SupabaseLike) {
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, slug, status, tag_type")
    .neq("status", "archived")
    .order("name", { ascending: true })
    .limit(1000);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ActiveTag[];
}

async function ensureDraftTag({
  existingTags,
  name,
  profileId,
  supabase,
}: {
  existingTags: ActiveTag[];
  name: string;
  profileId: string;
  supabase: SupabaseLike;
}) {
  const normalizedName = name.trim().toLowerCase();
  const byName = existingTags.find(
    (tag) => tag.name.trim().toLowerCase() === normalizedName,
  );

  if (byName) {
    return byName;
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let suffix = 1;

  while (
    existingTags.some((tag) => tag.slug.trim().toLowerCase() === slug.toLowerCase())
  ) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const { data, error } = await supabase
    .from("tags")
    .insert({
      created_by: profileId,
      name,
      slug,
      status: "draft",
      tag_type: "knowledge",
      updated_by: profileId,
    })
    .select("id, name, slug, status, tag_type")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const created = data as ActiveTag;
  existingTags.push(created);
  return created;
}

async function buildImportJson({
  activeTags,
  batchId,
  chunk,
  extraction,
  profileId,
  provider,
  questionIndexOffset = 0,
  supabase,
}: {
  activeTags: ActiveTag[];
  batchId: string;
  chunk?: Pick<AIPdfImportChunkSummary, "chunkIndex" | "pageEnd" | "pageStart">;
  extraction: AIPdfExtraction;
  profileId: string;
  provider: { id: string; model: string; name: string; provider: string };
  questionIndexOffset?: number;
  supabase: SupabaseLike;
}) {
  const bySlug = new Map(
    activeTags.map((tag) => [tag.slug.trim().toLowerCase(), tag]),
  );
  const byName = new Map(
    activeTags.map((tag) => [tag.name.trim().toLowerCase(), tag]),
  );
  const existingQuestionCodes = await loadExistingQuestionCodeKeys(supabase);
  const usedQuestionCodes = new Set<string>();
  const usedVisibleQuestionNumbers = new Set<string>();

  const questions = [];

  for (const [index, question] of extraction.questions.entries()) {
    const globalQuestionIndex = questionIndexOffset + index;
    const tagSlugs = new Set<string>();

    for (const slug of question.tag_slugs) {
      const tag = bySlug.get(slug.trim().toLowerCase());

      if (tag) {
        tagSlugs.add(tag.slug);
      }
    }

    for (const name of question.tag_names) {
      const tag = byName.get(name.trim().toLowerCase());

      if (tag) {
        tagSlugs.add(tag.slug);
      }
    }

    for (const name of question.new_tag_names) {
      const tag = await ensureDraftTag({
        existingTags: activeTags,
        name,
        profileId,
        supabase,
      });
      bySlug.set(tag.slug.trim().toLowerCase(), tag);
      byName.set(tag.name.trim().toLowerCase(), tag);
      tagSlugs.add(tag.slug);
    }

    const rawAiQuestionCode = question.question_code?.trim() || "";
    const visibleQuestionNumber = (
      question.question_number?.trim() ||
      rawAiQuestionCode ||
      ""
    ).slice(0, 80);
    const visibleNumberKey = visibleQuestionNumber
      ? visibleQuestionNumberKey(visibleQuestionNumber)
      : "";
    const questionCode = generateAIPdfQuestionCodeForImport({
      batchId,
      existingQuestionCodes,
      index: globalQuestionIndex,
      usedQuestionCodes,
    });

    if (!visibleQuestionNumber) {
      extraction.warnings.push(
        `Question ${globalQuestionIndex + 1}: missing visible question number; server-generated question_code ${questionCode} was used.`,
      );
    } else if (usedVisibleQuestionNumbers.has(visibleNumberKey)) {
      extraction.warnings.push(
        `Question ${globalQuestionIndex + 1}: duplicate visible question number "${visibleQuestionNumber}" was kept for review only; server-generated question_code ${questionCode} was used.`,
      );
    } else {
      usedVisibleQuestionNumbers.add(visibleNumberKey);
    }

    question.question_code = questionCode;
    const contentFields = normalizeAITextFields({
      html: question.content_html,
      source: question.content_source,
    });
    const solutionFields = normalizeAITextFields({
      html: question.solution_html,
      source: question.solution_source,
    });

    const contentHtml = contentFields.html || question.content_html;
    const contentSource = contentFields.source || stripHtml(question.content_html);
    const solutionHtml = solutionFields.html || question.solution_html || "";
    const solutionSource =
      solutionFields.source || stripHtml(question.solution_html) || "";
    const questionPayload: Record<string, unknown> = {
      ai_metadata: {
        asset_placeholders: question.asset_placeholders,
        chunk:
          chunk === undefined
            ? null
            : {
                chunk_index: chunk.chunkIndex,
                page_end: chunk.pageEnd,
                page_start: chunk.pageStart,
              },
        order_index: globalQuestionIndex,
        page_refs: question.page_refs,
        provider,
        raw_ai_question_code: rawAiQuestionCode || null,
        source: "ai_pdf_import",
        tag_decisions: {
          new_tag_names: question.new_tag_names,
          tag_names: question.tag_names,
          tag_slugs: question.tag_slugs,
        },
        visible_question_number: visibleQuestionNumber || null,
      },
      content_html: contentHtml,
      content_source: contentSource,
      content_source_format: contentFields.sourceFormat,
      difficulty_rating: question.difficulty_rating,
      question_code: questionCode,
      question_type: question.question_type,
      solution_source_format: solutionFields.sourceFormat,
      tag_slugs: Array.from(tagSlugs),
      title: question.title,
    };

    if (solutionHtml.trim()) {
      questionPayload.solution_html = solutionHtml;
    }

    if (solutionSource.trim()) {
      questionPayload.solution_source = solutionSource;
    }

    questions.push(questionPayload);
  }

  return JSON.stringify({ questions });
}

async function uploadQuestionAsset({
  alt,
  image,
  placeholder,
  profileId,
  questionId,
  supabase,
}: {
  alt: string;
  image: Buffer;
  placeholder: string;
  profileId: string;
  questionId: string;
  supabase: SupabaseLike;
}) {
  if (image.length > QUESTION_ASSET_MAX_BYTES) {
    throw new Error(`Cropped image ${placeholder} exceeds image size limit.`);
  }

  const assetId = crypto.randomUUID();
  const objectPath = `questions/${questionId}/${assetId}.png`;
  const { error: insertError } = await supabase.from("question_assets").insert({
    created_by: profileId,
    display_on_detail: true,
    id: assetId,
    mime_type: "image/png",
    object_path: objectPath,
    original_filename: `${placeholder.replace(/[{}:]/g, "")}.png`,
    question_id: questionId,
    size_bytes: image.length,
    status: "pending",
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  const { error: uploadError } = await supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .upload(objectPath, image, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadError) {
    await supabase.from("question_assets").delete().eq("id", assetId);
    throw new Error(uploadError.message);
  }

  const { error: updateError } = await supabase
    .from("question_assets")
    .update({ status: "ready" })
    .eq("id", assetId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data } = supabase.storage
    .from(QUESTION_ASSETS_BUCKET)
    .getPublicUrl(objectPath);

  return {
    assetId,
    html: `<img src="${escapeAttribute(data.publicUrl)}" alt="${escapeAttribute(
      alt || "AI imported figure",
    )}" data-ai-placeholder="${escapeAttribute(placeholder)}" />`,
    publicUrl: data.publicUrl,
  };
}

function replacePlaceholder(value: string | null, placeholder: string, html: string) {
  return value?.replaceAll(placeholder, html) ?? null;
}

async function attachCroppedAssets({
  createdQuestions,
  extraction,
  pdfBuffer,
  profileId,
  renderedPages,
  supabase,
}: {
  createdQuestions: { id: string; questionCode: string }[];
  extraction: AIPdfExtraction;
  pdfBuffer: Buffer;
  profileId: string;
  renderedPages?: RenderedPage[];
  supabase: SupabaseLike;
}) {
  const byCode = new Map(
    createdQuestions.map((question) => [question.questionCode.toLowerCase(), question]),
  );
  const placeholders = extraction.questions.flatMap((question) =>
    question.asset_placeholders.map((placeholder) => ({
      placeholder,
      question,
    })),
  );
  const warnings: string[] = [];
  let uploadedCount = 0;

  if (!placeholders.length) {
    return { uploadedCount, warnings };
  }

  let pages;

  try {
    pages = renderedPages?.length ? renderedPages : await renderPdfPages(pdfBuffer);
  } catch (error) {
    return {
      uploadedCount,
      warnings: [
        `PDF page rendering for image crops failed: ${
          error instanceof Error ? error.message : "Unknown render error"
        }`,
      ],
    };
  }

  for (const { placeholder, question } of placeholders) {
    const questionCode =
      question.question_code?.trim() ||
      createdQuestions.find((created) => !byCode.has(created.questionCode))?.questionCode;
    const created = questionCode ? byCode.get(questionCode.toLowerCase()) : null;

    if (!created) {
      warnings.push(`Could not find created question for ${placeholder.placeholder}.`);
      continue;
    }

    try {
      const cropped = await cropPdfPlaceholderImage({
        pages,
        placeholder,
      });
      const uploaded = await uploadQuestionAsset({
        alt: placeholder.alt ?? "AI imported figure",
        image: cropped,
        placeholder: placeholder.placeholder,
        profileId,
        questionId: created.id,
        supabase,
      });

      const { data: questionRow, error: questionError } = await supabase
        .from("questions")
        .select("content_html, content_source, solution_html, solution_source")
        .eq("id", created.id)
        .single();

      if (questionError) {
        throw new Error(questionError.message);
      }

      const nextContentHtml = replacePlaceholder(
        questionRow.content_html,
        placeholder.placeholder,
        uploaded.html,
      );
      const nextContentSource = replacePlaceholder(
        questionRow.content_source,
        placeholder.placeholder,
        uploaded.html,
      );
      const nextSolutionHtml = replacePlaceholder(
        questionRow.solution_html,
        placeholder.placeholder,
        uploaded.html,
      );
      const nextSolutionSource = replacePlaceholder(
        questionRow.solution_source,
        placeholder.placeholder,
        uploaded.html,
      );
      const wasEmbedded =
        nextContentHtml !== questionRow.content_html ||
        nextSolutionHtml !== questionRow.solution_html;

      if (!wasEmbedded) {
        warnings.push(
          `Placeholder ${placeholder.placeholder} was not found in content_html or solution_html; crop was attached as a question asset only.`,
        );
      }

      const { error: updateError } = await supabase
        .from("questions")
        .update({
          content_html: nextContentHtml
            ? sanitizeContentHtml(nextContentHtml)
            : "",
          content_source: nextContentSource,
          solution_html: nextSolutionHtml
            ? sanitizeContentHtml(nextSolutionHtml)
            : null,
          solution_source: nextSolutionSource,
          updated_by: profileId,
        })
        .eq("id", created.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      uploadedCount += 1;
    } catch (error) {
      warnings.push(
        `Crop ${placeholder.placeholder} failed: ${
          error instanceof Error ? error.message : "Unknown crop error"
        }`,
      );
    }
  }

  return { uploadedCount, warnings };
}

function providerPreparationCopy(strategy: AiPdfInputStrategy) {
  if (strategy === "openai_file") {
    return {
      detail: "Preparing full PDF input for the model.",
      phase: "preparing_pdf_input",
    };
  }

  if (strategy === "gemini_native_pdf") {
    return {
      detail: "Preparing Gemini Native full PDF input for the model.",
      phase: "preparing_native_pdf_input",
    };
  }

  if (strategy === "page_images") {
    return {
      detail: "Rendering PDF pages as ordered images for the model.",
      phase: "rendering_page_images",
    };
  }

  return {
    detail: "Preparing mock provider input.",
    phase: "preparing_provider_input",
  };
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function processAIPdfSinglePass({
  activeTags,
  input,
  pageCount,
  provider,
  providerInput,
  providerSummary,
}: {
  activeTags: ActiveTag[];
  input: ProcessInput;
  pageCount: number;
  provider: Awaited<ReturnType<typeof loadAIProviderProfileForUse>>;
  providerInput: ReturnType<typeof describeAiPdfProviderInput>;
  providerSummary: { id: string; model: string; name: string; provider: string };
}) {
  if (input.chunkIndex !== undefined) {
    throw new Error(
      "This provider uses full-PDF input and does not support single-chunk retry. Retry the full import after resetting generated drafts.",
    );
  }

  const prompt = buildPrompt({
    activeTags,
    fileName: input.fileName,
    pageCount,
  });

  await updateAIPdfBatchProgress(input, {
    detail:
      "Calling AI provider once with the full PDF. If the first JSON is invalid, the system will ask the model once more with the validation error to repair it.",
    pageCount,
    phase: "calling_provider",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
  });
  const extraction = normalizeAIPdfExtractionResponse(
    await callAIPdfExtractionProvider({
      fileName: input.fileName,
      inputStrategy: providerInput.strategy,
      pageImageDataUrls: [],
      pdfBase64: input.pdfBuffer.toString("base64"),
      pdfBytes: input.pdfBuffer,
      profile: provider,
      prompt,
    }),
  );

  await updateAIPdfBatchProgress(input, {
    detail: "AI response parsed and validated.",
    pageCount,
    phase: "provider_response_validated",
    provider: providerSummary,
    questionCount: extraction.questions.length,
    sourceInput: providerInput.strategy,
    warnings: extraction.warnings,
  });

  const jsonText = await buildImportJson({
    activeTags,
    batchId: input.batchId,
    extraction,
    profileId: input.profileId,
    provider: providerSummary,
    supabase: input.supabase,
  });
  await updateAIPdfBatchProgress(input, {
    detail: "Importing generated questions.",
    pageCount,
    phase: "importing_questions",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
    warnings: extraction.warnings,
  });

  const importSummary = await importBatchImportJson({
    allowDraftTags: true,
    batchId: input.batchId,
    initialSummaryExtras: {},
    jsonText,
    profileId: input.profileId,
    sourceType: "ai_pdf",
    supabase: input.supabase,
  });

  await updateAIPdfBatchProgress(input, {
    detail: "Attaching AI crop placeholders to created draft questions.",
    pageCount,
    phase: "cropping_assets",
    provider: providerSummary,
    questionCount: extraction.questions.length,
    sourceInput: providerInput.strategy,
    warnings: extraction.warnings,
  });
  const cropSummary =
    importSummary.createdCount > 0
      ? await attachCroppedAssets({
          createdQuestions: importSummary.createdQuestions,
          extraction,
          pdfBuffer: input.pdfBuffer,
          profileId: input.profileId,
          supabase: input.supabase,
        })
      : {
          uploadedCount: 0,
          warnings: ["No draft questions were created; skipped crop attachment."],
        };
  const currentBeforeFinal = await loadCurrentAIPdfSummary(input);
  const finalSummary = {
    ...importSummary,
    aiPdfImport: mergeAIPdfImportChunkingSummary(currentBeforeFinal.aiPdfImport, {
      createdQuestionCount: importSummary.createdCount,
      fileName: input.fileName,
      jobId: input.jobId,
      pageCount,
      phase: importSummary.createdCount > 0 ? "completed" : "failed",
      provider: providerSummary,
      sourceAssetId: input.sourceAssetId,
      sourceInput: providerInput.strategy,
      sourceObjectPath: input.sourceObjectPath,
      uploadedCropCount: cropSummary.uploadedCount,
      warnings: uniqueStrings([...extraction.warnings, ...cropSummary.warnings]),
    }),
  };
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: importSummary.createdCount > 0 ? "imported" : "failed",
      summary: finalSummary,
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }

  return finalSummary;
}

export async function processAIPdfImport(input: ProcessInput) {
  if (input.pdfBuffer.length > AI_PDF_IMPORT_MAX_BYTES) {
    throw new Error("PDF is larger than 50MB.");
  }

  await updateAIPdfBatchProgress(input, {
    detail: "Counting PDF pages.",
    phase: "counting_pages",
  });
  const pageCount = await getPdfPageCount(input.pdfBuffer);

  if (pageCount > AI_PDF_IMPORT_MAX_PAGES) {
    throw new Error("PDF has more than 50 pages. Split it before importing.");
  }

  await generateAndStorePdfPreanalysis({ input, pageCount });

  await updateAIPdfBatchProgress(input, {
    detail: "Loading AI provider profile.",
    pageCount,
    phase: "loading_provider",
  });
  const safeProvider = await loadSafeAIProviderProfileForUse({
    profileId: input.providerProfileId,
    supabase: input.supabase,
  });
  const providerSummary = {
    id: safeProvider.id,
    model: safeProvider.model,
    name: safeProvider.name,
    provider: safeProvider.provider,
  };
  const providerInput = describeAiPdfProviderInput(safeProvider);
  await updateAIPdfBatchProgress(input, {
    detail: "AI provider profile selected.",
    pageCount,
    phase: "loading_provider",
    provider: providerSummary,
    sourceInput: providerInput.strategy,
  });
  const provider = await loadAIProviderProfileForUse({
    profileId: input.providerProfileId,
    supabase: input.supabase,
  });

  if (!providerInput.supported) {
    throw new Error(AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE);
  }

  if (!providerInput.implemented) {
    throw new Error(providerInput.reason ?? AI_PDF_UNSUPPORTED_PROVIDER_MESSAGE);
  }

  await updateAIPdfBatchProgress(input, {
    detail: "Loading active tags for reuse.",
    pageCount,
    phase: "loading_tags",
    provider: providerSummary,
  });
  const activeTags = await loadActiveTags(input.supabase);
  const currentAfterTags = await loadCurrentAIPdfSummary(input);
  const plannedChunking =
    normalizeAIPdfChunkingSummary(currentAfterTags.aiPdfImport.chunking) ??
    patchAIPdfChunkingSummary({
      chunkIndex: 0,
      pageCount,
      patch: {},
      value: undefined,
    });
  const chunksToProcess = plannedChunking.chunks
    .filter((chunk) =>
      input.chunkIndex === undefined ? true : chunk.chunkIndex === input.chunkIndex,
    )
    .sort((left, right) => left.chunkIndex - right.chunkIndex);

  if (!chunksToProcess.length) {
    throw new Error("No matching AI PDF chunk was found to process.");
  }

  const preparation = providerPreparationCopy(providerInput.strategy);
  await updateAIPdfBatchProgress(input, {
    detail: preparation.detail,
    pageCount,
    phase: preparation.phase,
    provider: providerSummary,
    sourceInput: providerInput.strategy,
  });

  if (!supportsAIPdfSequentialChunkExtraction(providerInput.strategy)) {
    return processAIPdfSinglePass({
      activeTags,
      input,
      pageCount,
      provider,
      providerInput,
      providerSummary,
    });
  }

  const startingCreatedQuestions = createdQuestionsFromSummary(
    currentAfterTags.summary.createdQuestions,
  );
  let renderedPagesCache: RenderedPage[] | undefined;
  let questionIndexOffset = 0;
  const aggregate = {
    createdCount: numberFromRecord(currentAfterTags.summary, ["createdCount"]),
    duplicateCount: numberFromRecord(currentAfterTags.summary, ["duplicateCount"]),
    errorCount: numberFromRecord(currentAfterTags.summary, ["errorCount"]),
    invalidCount: numberFromRecord(currentAfterTags.summary, ["invalidCount"]),
    skippedCount: numberFromRecord(currentAfterTags.summary, ["skippedCount"]),
    unknownTagCount: numberFromRecord(currentAfterTags.summary, [
      "unknownTagCount",
    ]),
    uploadedCropCount: numberFromRecord(currentAfterTags.aiPdfImport, [
      "uploadedCropCount",
      "uploadedCrops",
    ]),
    validCount: numberFromRecord(currentAfterTags.summary, ["validCount"]),
  };
  const createdQuestions = [...startingCreatedQuestions];
  questionIndexOffset = aggregate.createdCount;
  const allWarnings: string[] = Array.isArray(currentAfterTags.aiPdfImport.warnings)
    ? currentAfterTags.aiPdfImport.warnings.map(String)
    : [];

  for (const chunk of chunksToProcess) {
    const startedAt = new Date().toISOString();
    const retryCount =
      input.chunkIndex === undefined ? chunk.retryCount ?? 0 : (chunk.retryCount ?? 0) + 1;

    await updateAIPdfChunkProgress({
      chunk,
      input,
      pageCount,
      patch: {
        completedAt: undefined,
        errorMessage: undefined,
        inputStrategy: providerInput.strategy,
        model: provider.model,
        provider: provider.provider,
        retryCount,
        startedAt,
        status: "running",
        warningCount: 0,
        warnings: [],
      },
      progress: {
        detail: `Calling AI provider for ${formatAIPdfChunkPageRange(chunk)}.`,
        pageCount,
        phase: "calling_provider",
        provider: providerSummary,
        sourceInput: providerInput.strategy,
      },
    });

    try {
      const chunkPrompt = buildPrompt({
        activeTags,
        chunk,
        fileName: input.fileName,
        pageCount,
      });
      const pagesForVision =
        providerInput.strategy !== "page_images"
          ? []
          : (
              renderedPagesCache ??
              (renderedPagesCache = await renderPdfPages(input.pdfBuffer))
            ).filter(
              (page) => page.page >= chunk.pageStart && page.page <= chunk.pageEnd,
            );
      const extraction = normalizeAIPdfExtractionResponse(
        await callAIPdfExtractionProvider({
          fileName: input.fileName,
          inputStrategy: providerInput.strategy,
          pageImageDataUrls: pagesForVision.map((page) => page.dataUrl),
          pdfBase64: input.pdfBuffer.toString("base64"),
          pdfBytes: input.pdfBuffer,
          profile: provider,
          prompt: chunkPrompt,
        }),
      );

      await updateAIPdfChunkProgress({
        chunk,
        input,
        pageCount,
        patch: {
          inputStrategy: providerInput.strategy,
          model: provider.model,
          provider: provider.provider,
          questionCount: extraction.questions.length,
          retryCount,
          status: "running",
          warningCount: extraction.warnings.length,
          warnings: extraction.warnings,
        },
        progress: {
          detail: `AI response parsed for ${formatAIPdfChunkPageRange(chunk)}.`,
          pageCount,
          phase: "provider_response_validated",
          provider: providerSummary,
          questionCount: extraction.questions.length,
          sourceInput: providerInput.strategy,
          warnings: extraction.warnings,
        },
      });

      const jsonText = await buildImportJson({
        activeTags,
        batchId: input.batchId,
        chunk,
        extraction,
        profileId: input.profileId,
        provider: providerSummary,
        questionIndexOffset,
        supabase: input.supabase,
      });
      await updateAIPdfBatchProgress(input, {
        detail: `Importing generated questions for ${formatAIPdfChunkPageRange(chunk)}.`,
        pageCount,
        phase: "importing_questions",
        provider: providerSummary,
        sourceInput: providerInput.strategy,
        warnings: uniqueStrings([...allWarnings, ...extraction.warnings]),
      });

      const importSummary = await importBatchImportJson({
        allowDraftTags: true,
        batchId: input.batchId,
        initialSummaryExtras: {},
        itemIndexOffset: chunk.chunkIndex * 1000,
        jsonText,
        profileId: input.profileId,
        sourceType: "ai_pdf",
        supabase: input.supabase,
      });
      const cropSummary =
        importSummary.createdCount > 0
          ? await attachCroppedAssets({
              createdQuestions: importSummary.createdQuestions,
              extraction,
              pdfBuffer: input.pdfBuffer,
              profileId: input.profileId,
              renderedPages: renderedPagesCache,
              supabase: input.supabase,
            })
          : {
              uploadedCount: 0,
              warnings: [
                `No draft questions were created for ${formatAIPdfChunkPageRange(
                  chunk,
                )}; skipped crop attachment.`,
              ],
            };
      const chunkWarnings = uniqueStrings([
        ...extraction.warnings,
        ...cropSummary.warnings,
      ]);

      aggregate.createdCount += importSummary.createdCount;
      aggregate.duplicateCount += importSummary.duplicateCount;
      aggregate.errorCount += importSummary.errorCount;
      aggregate.invalidCount += importSummary.invalidCount;
      aggregate.skippedCount += importSummary.skippedCount;
      aggregate.unknownTagCount += importSummary.unknownTagCount;
      aggregate.uploadedCropCount += cropSummary.uploadedCount;
      aggregate.validCount += importSummary.validCount;
      createdQuestions.push(...importSummary.createdQuestions);
      allWarnings.push(...chunkWarnings);
      questionIndexOffset += extraction.questions.length;

      await updateAIPdfChunkProgress({
        chunk,
        input,
        pageCount,
        patch: {
          completedAt: new Date().toISOString(),
          createdQuestionIds: importSummary.createdQuestions.map(
            (question) => question.id,
          ),
          inputStrategy: providerInput.strategy,
          model: provider.model,
          provider: provider.provider,
          questionCount: importSummary.createdCount,
          retryCount,
          status: "completed",
          warningCount: chunkWarnings.length,
          warnings: chunkWarnings,
        },
        progress: {
          detail: `Completed ${formatAIPdfChunkPageRange(chunk)}.`,
          pageCount,
          phase: "cropping_assets",
          provider: providerSummary,
          questionCount: aggregate.createdCount,
          sourceInput: providerInput.strategy,
          warnings: uniqueStrings(allWarnings),
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI PDF chunk extraction failed.";

      allWarnings.push(
        `${formatAIPdfChunkPageRange(chunk)} failed: ${message}`,
      );
      await updateAIPdfChunkProgress({
        chunk,
        input,
        pageCount,
        patch: {
          completedAt: new Date().toISOString(),
          errorMessage: message,
          inputStrategy: providerInput.strategy,
          model: provider.model,
          provider: provider.provider,
          retryCount,
          status: "failed",
          warningCount: 1,
          warnings: [message],
        },
        progress: {
          detail: `${formatAIPdfChunkPageRange(chunk)} failed; continuing remaining chunks.`,
          pageCount,
          phase: "calling_provider",
          provider: providerSummary,
          questionCount: aggregate.createdCount,
          sourceInput: providerInput.strategy,
          warnings: uniqueStrings(allWarnings),
        },
      });
    }
  }

  const currentBeforeFinal = await loadCurrentAIPdfSummary(input);
  const finalChunking = normalizeAIPdfChunkingSummary(
    currentBeforeFinal.aiPdfImport.chunking,
  );
  const hasFailedChunks = (finalChunking?.failedChunks ?? 0) > 0;
  const hasCreatedQuestions = aggregate.createdCount > 0;
  const finalPhase = hasCreatedQuestions
    ? hasFailedChunks
      ? "partial"
      : "completed"
    : "failed";
  const finalStatus = hasCreatedQuestions ? "imported" : "failed";
  const finalSummary = {
    ...currentBeforeFinal.summary,
    batchId: input.batchId,
    createdCount: aggregate.createdCount,
    createdQuestions,
    duplicateCount: aggregate.duplicateCount,
    errorCount: aggregate.errorCount,
    invalidCount: aggregate.invalidCount,
    skippedCount: aggregate.skippedCount,
    unknownTagCount: aggregate.unknownTagCount,
    validCount: aggregate.validCount,
    aiPdfImport: mergeAIPdfImportChunkingSummary(currentBeforeFinal.aiPdfImport, {
      createdQuestionCount: aggregate.createdCount,
      fileName: input.fileName,
      jobId: input.jobId,
      pageCount,
      phase: finalPhase,
      provider: providerSummary,
      sourceAssetId: input.sourceAssetId,
      sourceInput: providerInput.strategy,
      sourceObjectPath: input.sourceObjectPath,
      uploadedCropCount: aggregate.uploadedCropCount,
      warnings: uniqueStrings(allWarnings),
    }),
  };
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: finalStatus,
      summary: finalSummary,
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }

  return finalSummary;
}
