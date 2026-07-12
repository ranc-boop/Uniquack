import crypto from "node:crypto";

import sharp from "sharp";

export type AIPreanalysisSourceKind = "pdf" | "single_image";

export type AIPreanalysisStatus =
  | "pending"
  | "completed"
  | "failed"
  | "skipped";

export type AIPreanalysisPageClass =
  | "question_page"
  | "answer_page"
  | "mixed_page"
  | "cover_page"
  | "blank_page"
  | "unknown";

export type AIPreanalysisBoundaryRiskType =
  | "may_continue_previous_question"
  | "may_start_with_choices"
  | "may_end_mid_question"
  | "may_have_cross_page_figure"
  | "unknown";

export type AIImageQualityHint =
  | "likely_clear"
  | "too_small"
  | "large_image"
  | "likely_screenshot"
  | "likely_photo"
  | "orientation_unknown"
  | "blurry_unknown";

export interface AIPreanalysisResultBase {
  generatedAt: string;
  sourceHash?: string | null;
  sourceKind: AIPreanalysisSourceKind;
  status: AIPreanalysisStatus;
  version: "preanalysis_v1";
  warnings: string[];
}

export interface AIPreanalysisAssetHint {
  confidence: number;
  kind: "image" | "figure" | "table" | "unknown";
  note?: string;
  pageNumber?: number;
  region?: {
    height?: number;
    width?: number;
    x?: number;
    y?: number;
  } | null;
}

export interface AIPreanalysisBoundaryRisk {
  confidence: number;
  evidence?: string | null;
  pageNumber?: number;
  type: AIPreanalysisBoundaryRiskType;
}

export interface AIPdfPreanalysisPage {
  answerMarkerHints: string[];
  assetHints: AIPreanalysisAssetHint[];
  boundaryRisks: AIPreanalysisBoundaryRisk[];
  choiceMarkerHints: string[];
  extractedTextLength?: number;
  extractedTextPreview?: string | null;
  pageClass: AIPreanalysisPageClass;
  pageNumber: number;
  questionNumberHints: string[];
  textLayerAvailable: boolean;
}

export interface AIPdfPreanalysisResult extends AIPreanalysisResultBase {
  documentHints: {
    hasAnswerMarkers: boolean;
    hasChoiceMarkers: boolean;
    hasQuestionMarkers: boolean;
    likelyScannedPdf: boolean;
    likelyTwoColumnLayout?: boolean;
  };
  pageCount: number;
  pages: AIPdfPreanalysisPage[];
  sourceKind: "pdf";
  textLayerAvailable: boolean;
}

export interface AIImagePreanalysisResult extends AIPreanalysisResultBase {
  image: {
    fileSizeBytes?: number;
    height?: number;
    likelyPhoto?: boolean;
    likelyScreenshot?: boolean;
    orientationHint?: "portrait" | "landscape" | "square" | "unknown";
    qualityHints: AIImageQualityHint[];
    width?: number;
  };
  sourceKind: "single_image";
  subjectHint?: string | null;
  textHints: {
    extractedTextLength?: number;
    extractedTextPreview?: string | null;
    ocrTextAvailable: boolean;
  };
}

export type AIPreanalysisResult =
  | AIPdfPreanalysisResult
  | AIImagePreanalysisResult;

export type AIPdfPreanalysisPageInput = {
  pageNumber: number;
  text: string;
  textLayerAvailable?: boolean;
};

type ImageMetadataInput = {
  fileSizeBytes?: number;
  generatedAt?: string;
  height?: number;
  sourceHash?: string | null;
  warnings?: string[];
  width?: number;
};

const PREVIEW_MAX_LENGTH = 800;
const QUESTION_MARKER_REGEX =
  /(?:^|[\s\n])(?:Q(?:uestion)?|Problem)\s*\d+[A-Za-z]?|(?:^|[\s\n])(?:\(?\d+[A-Za-z]?\)|\d+[A-Za-z]?[.)])|(?:^|[\s\n])\u7b2c\s*\d+\s*\u9898/giu;
const CHOICE_MARKER_REGEX =
  /(?:^|[\s\n])(?:\(?[A-D]\)|[A-D][.:)]|[A-D]\s+\u9009\u9879)/gu;
const ANSWER_MARKER_REGEX =
  /\b(?:Answer|Solution|Explanation|Key)\b|\u7b54\u6848|\u89e3\u6790/giu;
const ASSET_MARKER_REGEX =
  /\b(?:figure|fig\.?|image|diagram|table|graph|chart)\b/giu;

function uniqueMatches(text: string, pattern: RegExp, limit = 12) {
  pattern.lastIndex = 0;
  const matches = Array.from(text.matchAll(pattern))
    .map((match) => match[0].trim())
    .filter(Boolean);

  return Array.from(new Set(matches)).slice(0, limit);
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function previewText(value: string) {
  const normalized = normalizeWhitespace(value);

  return normalized ? normalized.slice(0, PREVIEW_MAX_LENGTH) : null;
}

function tailText(value: string) {
  return value.slice(Math.max(0, value.length - 500));
}

function headText(value: string) {
  return value.slice(0, 500);
}

function hasMatch(text: string, pattern: RegExp) {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function classifyPdfPage({
  choiceMarkerHints,
  pageIndex,
  questionNumberHints,
  text,
}: {
  choiceMarkerHints: string[];
  pageIndex: number;
  questionNumberHints: string[];
  text: string;
}): AIPreanalysisPageClass {
  const normalized = normalizeWhitespace(text);
  const hasAnswerMarkers = hasMatch(normalized, ANSWER_MARKER_REGEX);
  const hasQuestionMarkers = questionNumberHints.length > 0;
  const hasChoices = choiceMarkerHints.length >= 2;

  if (normalized.length < 30) {
    return "blank_page";
  }

  if (hasAnswerMarkers && (hasQuestionMarkers || hasChoices)) {
    return "mixed_page";
  }

  if (hasAnswerMarkers) {
    return "answer_page";
  }

  if (hasQuestionMarkers && hasChoices) {
    return "question_page";
  }

  if (pageIndex === 0 && questionNumberHints.length <= 1 && normalized.length > 80) {
    return "cover_page";
  }

  return "unknown";
}

function assetHintsForPage(text: string, pageNumber: number) {
  return uniqueMatches(text, ASSET_MARKER_REGEX, 8).map((hint) => ({
    confidence: 0.35,
    kind: hint.toLowerCase().includes("table")
      ? ("table" as const)
      : hint.toLowerCase().includes("figure") ||
          hint.toLowerCase().includes("fig") ||
          hint.toLowerCase().includes("diagram") ||
          hint.toLowerCase().includes("graph") ||
          hint.toLowerCase().includes("chart")
        ? ("figure" as const)
        : ("image" as const),
    note: `Text marker detected: ${hint}`,
    pageNumber,
    region: null,
  }));
}

function boundaryRisksForPage(text: string, pageNumber: number) {
  const risks: AIPreanalysisBoundaryRisk[] = [];
  const head = headText(text);
  const tail = tailText(text);
  const tailChoices = uniqueMatches(tail, CHOICE_MARKER_REGEX, 8);
  const headChoices = uniqueMatches(head, CHOICE_MARKER_REGEX, 8);
  const tailHasQuestion = hasMatch(tail, QUESTION_MARKER_REGEX);
  const headHasQuestion = hasMatch(head, QUESTION_MARKER_REGEX);
  const hasEarlyContinuationChoice = /^\s*(?:\(?[BCD]\)|[BCD][.:)])/u.test(head);

  if (
    tailHasQuestion ||
    (tailChoices.some((choice) => /A[.:)]|\(A\)/u.test(choice)) &&
      tailChoices.some((choice) => /B[.:)]|\(B\)/u.test(choice)) &&
      !tailChoices.some((choice) => /C[.:)]|\(C\)/u.test(choice)))
  ) {
    risks.push({
      confidence: 0.55,
      evidence: previewText(tail),
      pageNumber,
      type: "may_end_mid_question",
    });
  }

  if (hasEarlyContinuationChoice) {
    risks.push({
      confidence: 0.6,
      evidence: previewText(head),
      pageNumber,
      type: "may_start_with_choices",
    });
  }

  if (!headHasQuestion && (headChoices.length > 0 || hasMatch(head, ANSWER_MARKER_REGEX))) {
    risks.push({
      confidence: 0.45,
      evidence: previewText(head),
      pageNumber,
      type: "may_continue_previous_question",
    });
  }

  if (hasMatch(tail, ASSET_MARKER_REGEX)) {
    risks.push({
      confidence: 0.35,
      evidence: previewText(tail),
      pageNumber,
      type: "may_have_cross_page_figure",
    });
  }

  return risks;
}

function likelyTwoColumnLayout(text: string) {
  const lines = text.split(/\n/).filter((line) => line.trim().length > 20);

  if (lines.length < 6) {
    return false;
  }

  const spacedLines = lines.filter((line) => /\S\s{8,}\S/u.test(line));

  return spacedLines.length / lines.length > 0.35;
}

export function analyzePdfPageTexts({
  generatedAt = new Date().toISOString(),
  pageCount,
  pages,
  sourceHash = null,
  warnings = [],
}: {
  generatedAt?: string;
  pageCount?: number;
  pages: AIPdfPreanalysisPageInput[];
  sourceHash?: string | null;
  warnings?: string[];
}): AIPdfPreanalysisResult {
  const analyzedPages = pages.map((page, pageIndex): AIPdfPreanalysisPage => {
    const text = page.text ?? "";
    const questionNumberHints = uniqueMatches(text, QUESTION_MARKER_REGEX);
    const choiceMarkerHints = uniqueMatches(text, CHOICE_MARKER_REGEX);
    const answerMarkerHints = uniqueMatches(text, ANSWER_MARKER_REGEX);

    return {
      answerMarkerHints,
      assetHints: assetHintsForPage(text, page.pageNumber),
      boundaryRisks: boundaryRisksForPage(text, page.pageNumber),
      choiceMarkerHints,
      extractedTextLength: normalizeWhitespace(text).length,
      extractedTextPreview: previewText(text),
      pageClass: classifyPdfPage({
        choiceMarkerHints,
        pageIndex,
        questionNumberHints,
        text,
      }),
      pageNumber: page.pageNumber,
      questionNumberHints,
      textLayerAvailable:
        page.textLayerAvailable ?? normalizeWhitespace(text).length > 0,
    };
  });
  const allText = pages.map((page) => page.text).join("\n");
  const textLayerAvailable = analyzedPages.some((page) => page.textLayerAvailable);
  const likelyScannedPdf = !textLayerAvailable;

  return {
    documentHints: {
      hasAnswerMarkers: analyzedPages.some(
        (page) => page.answerMarkerHints.length > 0,
      ),
      hasChoiceMarkers: analyzedPages.some(
        (page) => page.choiceMarkerHints.length > 0,
      ),
      hasQuestionMarkers: analyzedPages.some(
        (page) => page.questionNumberHints.length > 0,
      ),
      likelyScannedPdf,
      likelyTwoColumnLayout: likelyTwoColumnLayout(allText),
    },
    generatedAt,
    pageCount: pageCount ?? analyzedPages.length,
    pages: analyzedPages,
    sourceHash,
    sourceKind: "pdf",
    status: "completed",
    textLayerAvailable,
    version: "preanalysis_v1",
    warnings: [
      ...warnings,
      ...(likelyScannedPdf
        ? ["No PDF text layer was detected; OCR or vision fallback may be needed later."]
        : []),
    ],
  };
}

export function sha256Hex(bytes: Buffer | Uint8Array) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function orientationHint({
  height,
  width,
}: {
  height?: number;
  width?: number;
}): "portrait" | "landscape" | "square" | "unknown" {
  if (!height || !width) {
    return "unknown";
  }

  if (height > width * 1.15) {
    return "portrait";
  }

  if (width > height * 1.15) {
    return "landscape";
  }

  return "square";
}

function imageQualityHints({
  fileSizeBytes,
  height,
  orientation,
  width,
}: {
  fileSizeBytes?: number;
  height?: number;
  orientation: "portrait" | "landscape" | "square" | "unknown";
  width?: number;
}) {
  const hints: AIImageQualityHint[] = [];

  if (!height || !width) {
    return ["orientation_unknown", "blurry_unknown"] as AIImageQualityHint[];
  }

  if (width < 700 || height < 500) {
    hints.push("too_small");
  }

  if (fileSizeBytes && fileSizeBytes > 6 * 1024 * 1024) {
    hints.push("large_image");
  }

  if (orientation === "portrait" && height / width > 1.45) {
    hints.push("likely_photo");
  }

  if (
    (orientation === "landscape" && width / height > 1.45) ||
    (orientation === "portrait" && height / width > 1.75)
  ) {
    hints.push("likely_screenshot");
  }

  if (width >= 1000 && height >= 700) {
    hints.push("likely_clear");
  }

  hints.push("blurry_unknown");

  return Array.from(new Set(hints));
}

export function generateImagePreanalysisFromMetadata({
  fileSizeBytes,
  generatedAt = new Date().toISOString(),
  height,
  sourceHash = null,
  warnings = [],
  width,
}: ImageMetadataInput): AIImagePreanalysisResult {
  const orientation = orientationHint({ height, width });
  const qualityHints = imageQualityHints({
    fileSizeBytes,
    height,
    orientation,
    width,
  });

  return {
    generatedAt,
    image: {
      fileSizeBytes,
      height,
      likelyPhoto: qualityHints.includes("likely_photo"),
      likelyScreenshot: qualityHints.includes("likely_screenshot"),
      orientationHint: orientation,
      qualityHints,
      width,
    },
    sourceHash,
    sourceKind: "single_image",
    status: "completed",
    subjectHint: null,
    textHints: {
      extractedTextLength: 0,
      extractedTextPreview: null,
      ocrTextAvailable: false,
    },
    version: "preanalysis_v1",
    warnings,
  };
}

export async function generateImagePreanalysis({
  fileBuffer,
  generatedAt = new Date().toISOString(),
}: {
  fileBuffer: Buffer;
  generatedAt?: string;
}) {
  const metadata = await sharp(fileBuffer).metadata();

  return generateImagePreanalysisFromMetadata({
    fileSizeBytes: fileBuffer.length,
    generatedAt,
    height: metadata.height,
    sourceHash: sha256Hex(fileBuffer),
    width: metadata.width,
  });
}

export function failedPdfPreanalysis({
  error,
  generatedAt = new Date().toISOString(),
  pageCount,
  sourceHash = null,
}: {
  error: string;
  generatedAt?: string;
  pageCount: number;
  sourceHash?: string | null;
}): AIPdfPreanalysisResult {
  return {
    documentHints: {
      hasAnswerMarkers: false,
      hasChoiceMarkers: false,
      hasQuestionMarkers: false,
      likelyScannedPdf: false,
      likelyTwoColumnLayout: false,
    },
    generatedAt,
    pageCount,
    pages: [],
    sourceHash,
    sourceKind: "pdf",
    status: "failed",
    textLayerAvailable: false,
    version: "preanalysis_v1",
    warnings: [`preanalysis failed: ${error}`],
  };
}
