import { callAIPdfExtractionProvider } from "@/lib/ai-providers/chat";
import { loadAIProviderProfileForUse } from "@/lib/ai-providers/profiles";
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
  aiPdfExtractionSchema,
  type AIPdfAssetPlaceholder,
  type AIPdfExtraction,
  type AIPdfQuestion,
} from "@/lib/ai-pdf-import/schema";
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
  sourceInput?: "pdf" | "page_images";
  warnings?: string[];
};

async function updateAIPdfBatchProgress(
  input: ProcessInput,
  progress: AIPdfProgress,
) {
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: "validating",
      summary: {
        aiPdfImport: {
          fileName: input.fileName,
          jobId: input.jobId,
          sourceAssetId: input.sourceAssetId,
          sourceObjectPath: input.sourceObjectPath,
          updatedAt: new Date().toISOString(),
          ...progress,
        },
      },
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
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

function defaultQuestionCode(batchId: string, index: number) {
  return `AI-${batchId.slice(0, 8).toUpperCase()}-${String(index + 1).padStart(3, "0")}`;
}

function buildPrompt({
  activeTags,
  fileName,
  pageCount,
}: {
  activeTags: ActiveTag[];
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
          question_code: "Short stable code if visible, otherwise omit.",
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
  extraction,
  profileId,
  provider,
  supabase,
}: {
  activeTags: ActiveTag[];
  batchId: string;
  extraction: AIPdfExtraction;
  profileId: string;
  provider: { id: string; model: string; name: string; provider: string };
  supabase: SupabaseLike;
}) {
  const bySlug = new Map(
    activeTags.map((tag) => [tag.slug.trim().toLowerCase(), tag]),
  );
  const byName = new Map(
    activeTags.map((tag) => [tag.name.trim().toLowerCase(), tag]),
  );

  const questions = [];

  for (const [index, question] of extraction.questions.entries()) {
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

    const questionCode =
      question.question_code?.trim() || defaultQuestionCode(batchId, index);
    question.question_code = questionCode;
    const contentFields = normalizeAITextFields({
      html: question.content_html,
      source: question.content_source,
    });
    const solutionFields = normalizeAITextFields({
      html: question.solution_html,
      source: question.solution_source,
    });

    questions.push({
      ai_metadata: {
        asset_placeholders: question.asset_placeholders,
        page_refs: question.page_refs,
        provider,
        source: "ai_pdf_import",
        tag_decisions: {
          new_tag_names: question.new_tag_names,
          tag_names: question.tag_names,
          tag_slugs: question.tag_slugs,
        },
      },
      content_html: contentFields.html || question.content_html,
      content_source: contentFields.source || stripHtml(question.content_html),
      content_source_format: contentFields.sourceFormat,
      difficulty_rating: question.difficulty_rating,
      question_code: questionCode,
      question_type: question.question_type,
      solution_html: solutionFields.html || question.solution_html,
      solution_source: solutionFields.source || stripHtml(question.solution_html),
      solution_source_format: solutionFields.sourceFormat,
      tag_slugs: Array.from(tagSlugs),
      title: question.title,
    });
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

  await updateAIPdfBatchProgress(input, {
    detail: "Loading AI provider profile.",
    pageCount,
    phase: "loading_provider",
  });
  const provider = await loadAIProviderProfileForUse({
    profileId: input.providerProfileId,
    supabase: input.supabase,
  });
  const providerSummary = {
    id: provider.id,
    model: provider.model,
    name: provider.name,
    provider: provider.provider,
  };

  await updateAIPdfBatchProgress(input, {
    detail: "Loading active tags for reuse.",
    pageCount,
    phase: "loading_tags",
    provider: providerSummary,
  });
  const activeTags = await loadActiveTags(input.supabase);
  const prompt = buildPrompt({
    activeTags,
    fileName: input.fileName,
    pageCount,
  });

  await updateAIPdfBatchProgress(input, {
    detail: provider.supports_pdf_input
      ? "Preparing full PDF input for the model."
      : "Rendering all PDF pages as ordered images for the model.",
    pageCount,
    phase: provider.supports_pdf_input ? "preparing_pdf_input" : "rendering_page_images",
    provider: providerSummary,
    sourceInput: provider.supports_pdf_input ? "pdf" : "page_images",
  });
  const pagesForVision = provider.supports_pdf_input
    ? []
    : await renderPdfPages(input.pdfBuffer);

  await updateAIPdfBatchProgress(input, {
    detail:
      "Calling AI provider. If the first JSON is invalid, the system will ask the model once more with the validation error to repair it.",
    pageCount,
    phase: "calling_provider",
    provider: providerSummary,
    sourceInput: provider.supports_pdf_input ? "pdf" : "page_images",
  });
  const extraction = aiPdfExtractionSchema.parse(
    await callAIPdfExtractionProvider({
      fileName: input.fileName,
      pageImageDataUrls: pagesForVision.map((page) => page.dataUrl),
      pdfBase64: input.pdfBuffer.toString("base64"),
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
    warnings: extraction.warnings,
  });

  await updateAIPdfBatchProgress(input, {
    detail: "Normalizing AI questions into the shared import format.",
    pageCount,
    phase: "building_import_json",
    provider: providerSummary,
    questionCount: extraction.questions.length,
    warnings: extraction.warnings,
  });
  const jsonText = await buildImportJson({
    activeTags,
    batchId: input.batchId,
    extraction,
    profileId: input.profileId,
    provider: {
      id: provider.id,
      model: provider.model,
      name: provider.name,
      provider: provider.provider,
    },
    supabase: input.supabase,
  });
  const importSummary = await importBatchImportJson({
    allowDraftTags: true,
    batchId: input.batchId,
    initialSummaryExtras: {
      aiPdfImport: {
        fileName: input.fileName,
        jobId: input.jobId,
        pageCount,
        phase: "importing_questions",
        provider: {
          id: provider.id,
          model: provider.model,
          name: provider.name,
          provider: provider.provider,
        },
        sourceAssetId: input.sourceAssetId,
        sourceObjectPath: input.sourceObjectPath,
        warnings: extraction.warnings,
      },
    },
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
    warnings: extraction.warnings,
  });
  const cropSummary = await attachCroppedAssets({
    createdQuestions: importSummary.createdQuestions,
    extraction,
    pdfBuffer: input.pdfBuffer,
    profileId: input.profileId,
    renderedPages: pagesForVision,
    supabase: input.supabase,
  });
  const finalSummary = {
    ...importSummary,
    aiPdfImport: {
      createdQuestionCount: importSummary.createdCount,
      fileName: input.fileName,
      jobId: input.jobId,
      pageCount,
      phase: "completed",
      provider: {
        id: provider.id,
        model: provider.model,
        name: provider.name,
        provider: provider.provider,
      },
      sourceAssetId: input.sourceAssetId,
      sourceObjectPath: input.sourceObjectPath,
      uploadedCropCount: cropSummary.uploadedCount,
      warnings: [...extraction.warnings, ...cropSummary.warnings],
    },
  };
  const { error } = await input.supabase
    .from("import_batches")
    .update({
      status: importSummary.errorCount > 0 ? "failed" : "imported",
      summary: finalSummary,
    })
    .eq("id", input.batchId);

  if (error) {
    throw new Error(error.message);
  }

  return finalSummary;
}
