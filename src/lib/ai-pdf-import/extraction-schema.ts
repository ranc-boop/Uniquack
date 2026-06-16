import type { AIWorkPacket } from "./packets";

export type AIExtractionSchemaVersion = "question_extract_v1";

export type AIQuestionFormat =
  | "multiple_choice"
  | "free_response"
  | "short_answer"
  | "true_false"
  | "unknown";

export type AIExtractionStatus = "valid" | "partial" | "invalid";

export type AIExtractionConfidenceLevel = "high" | "medium" | "low";

export type AIExtractionErrorCode =
  | "packet_id_mismatch"
  | "packet_hash_mismatch"
  | "missing_question"
  | "missing_stem"
  | "invalid_options"
  | "invalid_option_label"
  | "invalid_answer_format"
  | "invalid_asset_ref"
  | "invalid_page_ref"
  | "low_confidence"
  | "unknown_format";

export interface AIExtractionError {
  code: AIExtractionErrorCode;
  message: string;
}

export interface AIExtractedOption {
  content: string;
  label: string;
}

export interface AIExtractedAssetRef {
  assetRef?: string | null;
  kind: "image" | "figure" | "table" | "unknown";
  note?: string | null;
  pageNumber?: number | null;
}

export interface AIExtractedQuestion {
  answer: string | null;
  assets: AIExtractedAssetRef[];
  explanation: string | null;
  format: AIQuestionFormat;
  options: AIExtractedOption[];
  questionNumber: string | null;
  source: {
    packetHash: string;
    packetId: string;
    pageNumbers: number[];
  };
  stem: string;
}

export interface AIPacketExtractionResult {
  confidence: {
    level: AIExtractionConfidenceLevel;
    score: number;
  };
  errors: AIExtractionError[];
  packetHash: string;
  packetId: string;
  question: AIExtractedQuestion | null;
  review: {
    reasonCodes: string[];
    reviewRequired: boolean;
  };
  status: AIExtractionStatus;
  version: AIExtractionSchemaVersion;
  warnings: string[];
}

export interface DraftReadyQuestionFromExtraction {
  aiMetadata: {
    assetRefs: AIExtractedAssetRef[];
    confidence: AIPacketExtractionResult["confidence"];
    extractionVersion: AIExtractionSchemaVersion;
    packetHash: string;
    packetId: string;
    pageNumbers: number[];
    questionNumber: string | null;
    review: AIPacketExtractionResult["review"];
  };
  answer: string | null;
  contentHtml: string;
  contentSource: string;
  questionType: "mcq" | "frq" | "mixed";
  solutionHtml?: string;
  solutionSource?: string;
  title: string;
}

export interface DraftReadyQuestionBuildResult {
  draft: DraftReadyQuestionFromExtraction | null;
  errors: AIExtractionError[];
  warnings: string[];
}

const VALID_FORMATS = new Set<AIQuestionFormat>([
  "multiple_choice",
  "free_response",
  "short_answer",
  "true_false",
  "unknown",
]);
const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];
const VALID_JSON_ESCAPED_HTML: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: unknown) {
  const text = stringValue(value);
  return text ? text : null;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function pushError(
  errors: AIExtractionError[],
  code: AIExtractionErrorCode,
  message: string,
) {
  errors.push({ code, message });
}

function clampConfidence(value: unknown) {
  const numeric =
    typeof value === "number"
      ? value
      : Number(asRecord(value).score ?? asRecord(value).value ?? value);

  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.min(1, numeric));
}

function confidenceLevel(score: number): AIExtractionConfidenceLevel {
  if (score >= 0.85) {
    return "high";
  }

  if (score >= 0.6) {
    return "medium";
  }

  return "low";
}

function normalizeFormat(value: unknown, errors: AIExtractionError[]) {
  const raw = stringValue(value).toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, AIQuestionFormat> = {
    frq: "free_response",
    mc: "multiple_choice",
    mcq: "multiple_choice",
    multiple_choice_question: "multiple_choice",
    short: "short_answer",
    tf: "true_false",
  };
  const normalized = aliases[raw] ?? raw;

  if (VALID_FORMATS.has(normalized as AIQuestionFormat)) {
    return normalized as AIQuestionFormat;
  }

  pushError(errors, "unknown_format", `Unknown question format: ${raw || "(blank)"}.`);
  return "unknown";
}

function parseOptionLabel(value: string) {
  const match = value.match(/^\s*(?:\(?([A-Za-z])\)?[.:)]?)\s+([\s\S]+)$/);

  if (!match) {
    return null;
  }

  return {
    content: match[2].trim(),
    label: match[1].toUpperCase(),
  };
}

function normalizeOptions(value: unknown, errors: AIExtractionError[]) {
  if (!Array.isArray(value)) {
    return [];
  }

  const options: AIExtractedOption[] = [];
  const seenLabels = new Set<string>();

  for (const [index, item] of value.entries()) {
    const record = asRecord(item);
    const fromString = typeof item === "string" ? parseOptionLabel(item) : null;
    const labelCandidate =
      fromString?.label ??
      stringValue(record.label).replace(/[().:]/g, "").toUpperCase();
    const label = (labelCandidate || OPTION_LABELS[index] || "").trim();
    const content = (
      fromString?.content ??
      stringValue(record.content || record.text || record.value || item)
    ).trim();

    if (!OPTION_LABELS.includes(label) || seenLabels.has(label)) {
      pushError(errors, "invalid_option_label", `Invalid option label: ${label}.`);
      continue;
    }

    if (!content) {
      pushError(errors, "invalid_options", `Option ${label} has no content.`);
      continue;
    }

    seenLabels.add(label);
    options.push({ content, label });
  }

  return options;
}

function normalizeWarnings(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function allowedAssetRefs(packet: AIWorkPacket) {
  return new Set(
    packet.assetRefs.flatMap((asset, index) => {
      const page = asset.pageNumber ?? packet.pageNumbers[0] ?? null;
      return [
        `asset:${index}`,
        `asset:${asset.assetHintIndex ?? index}`,
        page === null ? "" : `page:${page}:${asset.kind}:${asset.assetHintIndex ?? index}`,
      ].filter(Boolean);
    }),
  );
}

function normalizeAssets({
  errors,
  packet,
  value,
}: {
  errors: AIExtractionError[];
  packet: AIWorkPacket;
  value: unknown;
}) {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowedPages = new Set(packet.pageNumbers);
  const allowedRefs = allowedAssetRefs(packet);
  const assets: AIExtractedAssetRef[] = [];

  for (const item of value) {
    const record = asRecord(item);
    const assetRef =
      typeof item === "string" ? item.trim() : optionalString(record.assetRef);
    const pageNumber = Number(record.pageNumber ?? record.page ?? NaN);
    const hasValidPage =
      Number.isInteger(pageNumber) && allowedPages.has(pageNumber);
    const hasValidRef = assetRef ? allowedRefs.has(assetRef) : false;

    if (!hasValidPage && !hasValidRef) {
      pushError(
        errors,
        "invalid_asset_ref",
        `Asset reference ${assetRef || "(missing)"} is not in the packet scope.`,
      );
      continue;
    }

    const rawKind = stringValue(record.kind).toLowerCase();
    const kind = ["image", "figure", "table"].includes(rawKind)
      ? (rawKind as AIExtractedAssetRef["kind"])
      : "unknown";

    assets.push({
      assetRef,
      kind,
      note: optionalString(record.note),
      pageNumber: hasValidPage ? pageNumber : null,
    });
  }

  return assets;
}

function normalizePageNumbers({
  errors,
  packet,
  value,
}: {
  errors: AIExtractionError[];
  packet: AIWorkPacket;
  value: unknown;
}) {
  const allowedPages = new Set(packet.pageNumbers);
  const rawPages = Array.isArray(value) ? value : packet.pageNumbers;
  const pages = rawPages
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1);
  const validPages = pages.filter((page) => allowedPages.has(page));

  if (validPages.length !== pages.length) {
    pushError(
      errors,
      "invalid_page_ref",
      "Extraction referenced pages outside the packet page range.",
    );
  }

  return validPages.length ? Array.from(new Set(validPages)) : packet.pageNumbers;
}

function escapeHtml(value: string) {
  return value.replace(/[&"<>]/g, (match) => VALID_JSON_ESCAPED_HTML[match] ?? match);
}

function draftQuestionType(format: AIQuestionFormat): "mcq" | "frq" | "mixed" {
  if (format === "multiple_choice" || format === "true_false") {
    return "mcq";
  }

  return "frq";
}

function reviewReasons({
  errors,
  format,
  packet,
  question,
  score,
  status,
}: {
  errors: AIExtractionError[];
  format: AIQuestionFormat;
  packet: AIWorkPacket;
  question: AIExtractedQuestion | null;
  score: number;
  status: AIExtractionStatus;
}) {
  const reasons: string[] = [];

  if (status !== "valid") {
    reasons.push(`status_${status}`);
  }

  if (score < 0.85) {
    reasons.push("low_confidence");
  }

  if (!question?.answer) {
    reasons.push("missing_answer");
  }

  if (question?.explanation === null) {
    reasons.push("missing_explanation");
  }

  if (format === "multiple_choice" && (question?.options.length ?? 0) < 4) {
    reasons.push("multiple_choice_needs_option_review");
  }

  if (packet.kind === "pdf_boundary_risk" || packet.reviewHints.likelyNeedsBoundaryReread) {
    reasons.push("boundary_risk_packet");
  }

  if (packet.kind === "unknown") {
    reasons.push("unknown_packet_kind");
  }

  if (errors.length > 0) {
    reasons.push(...errors.map((error) => error.code));
  }

  return uniqueStrings(reasons);
}

export function normalizeAIPacketExtractionResult({
  packet,
  raw,
}: {
  packet: AIWorkPacket;
  raw: unknown;
}): AIPacketExtractionResult {
  const record = asRecord(raw);
  const errors: AIExtractionError[] = [];
  const warnings = normalizeWarnings(record.warnings);
  const packetId = stringValue(record.packetId || record.packet_id);
  const packetHash = stringValue(record.packetHash || record.packet_hash);

  if (packetId !== packet.packetId) {
    pushError(errors, "packet_id_mismatch", "Extraction packetId does not match.");
  }

  if (packetHash !== packet.packetHash) {
    pushError(
      errors,
      "packet_hash_mismatch",
      "Extraction packetHash does not match.",
    );
  }

  const questionRecord = asRecord(record.question);
  const hasQuestion = Object.keys(questionRecord).length > 0;
  let question: AIExtractedQuestion | null = null;
  let format: AIQuestionFormat = "unknown";

  if (!hasQuestion) {
    pushError(errors, "missing_question", "Extraction result did not include a question.");
  } else {
    format = normalizeFormat(
      questionRecord.format || questionRecord.questionFormat || questionRecord.type,
      errors,
    );
    const stem = stringValue(
      questionRecord.stem || questionRecord.question || questionRecord.content,
    );

    if (!stem) {
      pushError(errors, "missing_stem", "Extracted question stem is missing.");
    }

    const options = normalizeOptions(questionRecord.options, errors);

    if (format === "multiple_choice" && options.length < 2) {
      pushError(
        errors,
        "invalid_options",
        "Multiple choice extraction must include at least two options.",
      );
    }

    const answer = optionalString(questionRecord.answer);

    if (
      answer &&
      format === "multiple_choice" &&
      options.length > 0 &&
      !options.some((option) => option.label === answer.replace(/[().:]/g, "").toUpperCase())
    ) {
      pushError(
        errors,
        "invalid_answer_format",
        "Multiple choice answer does not match an option label.",
      );
    }

    const pageNumbers = normalizePageNumbers({
      errors,
      packet,
      value: asRecord(questionRecord.source).pageNumbers ?? questionRecord.pageNumbers,
    });

    question = {
      answer,
      assets: normalizeAssets({
        errors,
        packet,
        value: questionRecord.assets || questionRecord.assetRefs,
      }),
      explanation: optionalString(
        questionRecord.explanation || questionRecord.solution,
      ),
      format,
      options,
      questionNumber: optionalString(
        questionRecord.questionNumber || questionRecord.question_number,
      ),
      source: {
        packetHash: packet.packetHash,
        packetId: packet.packetId,
        pageNumbers,
      },
      stem,
    };
  }

  const score = clampConfidence(record.confidence);
  const statusFromModel = stringValue(record.status);
  const baseStatus = ["valid", "partial", "invalid"].includes(statusFromModel)
    ? (statusFromModel as AIExtractionStatus)
    : "partial";
  const fatalCodes = new Set<AIExtractionErrorCode>([
    "missing_question",
    "missing_stem",
    "invalid_options",
    "packet_id_mismatch",
    "packet_hash_mismatch",
  ]);
  const status = errors.some((error) => fatalCodes.has(error.code))
    ? "invalid"
    : errors.length > 0
      ? "partial"
      : baseStatus;

  const reasonCodes = reviewReasons({
    errors,
    format,
    packet,
    question,
    score,
    status,
  });

  return {
    confidence: {
      level: confidenceLevel(score),
      score,
    },
    errors,
    packetHash: packet.packetHash,
    packetId: packet.packetId,
    question: status === "invalid" ? question : question,
    review: {
      reasonCodes,
      reviewRequired: reasonCodes.length > 0,
    },
    status,
    version: "question_extract_v1",
    warnings: uniqueStrings(warnings),
  };
}

export function buildDraftReadyQuestionFromExtraction(
  result: AIPacketExtractionResult,
): DraftReadyQuestionBuildResult {
  if (result.status === "invalid" || !result.question) {
    return {
      draft: null,
      errors: result.errors,
      warnings: result.warnings,
    };
  }

  const question = result.question;
  const optionLines =
    question.options.length > 0
      ? `\n\n${question.options
          .map((option) => `${option.label}. ${option.content}`)
          .join("\n")}`
      : "";
  const contentSource = `${question.stem}${optionLines}`.trim();
  const solutionSource = [question.answer && `Answer: ${question.answer}`, question.explanation]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return {
    draft: {
      aiMetadata: {
        assetRefs: question.assets,
        confidence: result.confidence,
        extractionVersion: result.version,
        packetHash: result.packetHash,
        packetId: result.packetId,
        pageNumbers: question.source.pageNumbers,
        questionNumber: question.questionNumber,
        review: result.review,
      },
      answer: question.answer,
      contentHtml: `<p>${escapeHtml(contentSource).replace(/\n/g, "<br />")}</p>`,
      contentSource,
      questionType: draftQuestionType(question.format),
      ...(solutionSource
        ? {
            solutionHtml: `<p>${escapeHtml(solutionSource).replace(/\n/g, "<br />")}</p>`,
            solutionSource,
          }
        : {}),
      title: question.questionNumber
        ? `Question ${question.questionNumber}`
        : "Imported question draft",
    },
    errors: result.errors,
    warnings: result.warnings,
  };
}

export function buildSchemaFirstExtractionPrompt(batch: {
  batchId: string;
  batchKind?: string;
  packetRefs: Array<{
    packetHash: string;
    packetId: string;
    pageNumbers: number[];
  }>;
}) {
  return [
    "You are extracting structured question data from pre-planned work packets.",
    "Return JSON only. Do not wrap the response in markdown fences.",
    "Return exactly one result per packet.",
    "Each result must use version question_extract_v1.",
    "Preserve each packetId and packetHash exactly as provided.",
    "If a value is missing or uncertain, use null and lower confidence.",
    "Do not invent answers, assets, page numbers, packet IDs, or packet hashes.",
    "Use only asset references and page numbers provided by each packet.",
    "Set review.reviewRequired true and include a reason when unsure.",
    "Extra fields may be ignored by the importer.",
    "",
    `Batch: ${batch.batchId}`,
    `Batch kind: ${batch.batchKind ?? "unknown"}`,
    "Expected JSON shape:",
    JSON.stringify({
      results: batch.packetRefs.map((packet) => ({
        confidence: 0.75,
        packetHash: packet.packetHash,
        packetId: packet.packetId,
        question: {
          answer: null,
          assets: [],
          explanation: null,
          format: "unknown",
          options: [],
          questionNumber: null,
          source: { pageNumbers: packet.pageNumbers },
          stem: "",
        },
        review: { reasonCodes: ["uncertain"], reviewRequired: true },
        status: "partial",
        version: "question_extract_v1",
        warnings: [],
      })),
    }),
  ].join("\n");
}
