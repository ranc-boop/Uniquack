import "server-only";

import { createHash } from "node:crypto";

import type { AIPdfAssetPlaceholder } from "@/lib/ai-pdf-import/schema";

export const AI_PDF_VISUAL_EVIDENCE_CONTRACT_VERSION = 2;
export const AI_PDF_VISUAL_MISSING_WARNING =
  "Visual evidence is still required before this Draft can be approved.";

export const aiPdfVisualRoles = [
  "answer_figure",
  "decorative",
  "diagram",
  "graph",
  "question_figure",
  "table",
] as const;

export type AIPdfVisualRole = (typeof aiPdfVisualRoles)[number];

export const aiPdfVisualProposalRejectionReasons = [
  "decorative_required",
  "missing_question_lineage",
  "page_outside_question_lineage",
  "invalid_source_region",
  "source_render_unavailable",
  "invalid_crop_content",
] as const;

export type AIPdfVisualProposalRejectionReason =
  (typeof aiPdfVisualProposalRejectionReasons)[number];

export type AIPdfVisualProposalRejectionCounts = Record<
  AIPdfVisualProposalRejectionReason,
  number
>;

export function emptyAIPdfVisualProposalRejectionCounts(): AIPdfVisualProposalRejectionCounts {
  return Object.fromEntries(
    aiPdfVisualProposalRejectionReasons.map((reason) => [reason, 0]),
  ) as AIPdfVisualProposalRejectionCounts;
}

const VISUAL_ALT_BY_ROLE: Record<AIPdfVisualRole, string> = {
  answer_figure: "Answer figure",
  decorative: "Decorative image",
  diagram: "Question diagram",
  graph: "Question graph",
  question_figure: "Question figure",
  table: "Question table",
};

const REQUIRED_VISUAL_PATTERNS = [
  /\b(?:as|in)\s+(?:the\s+)?(?:diagram|figure|graph|table)\s+(?:below|above|shown)\b/i,
  /\bshown\s+(?:below|above|in\s+the\s+(?:diagram|figure|graph|table))\b/i,
  /\buse\s+(?:the\s+)?(?:diagram|figure|graph|table|coordinate plane)\b/i,
  /\baccording\s+to\s+(?:the\s+)?(?:diagram|figure|graph|table)\b/i,
  /\bthe\s+(?:diagram|figure|graph|table|circuit)\s+(?:shows|represents|depicts)\b/i,
];

function stripHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function finiteUnit(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function questionRequiresVisualEvidence({
  contentHtml,
  contentSource,
}: {
  contentHtml?: string | null;
  contentSource?: string | null;
}) {
  const text = stripHtml(`${contentSource ?? ""} ${contentHtml ?? ""}`);
  return REQUIRED_VISUAL_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateAIPdfVisualProposal({
  availablePageNumbers,
  pageCount,
  placeholder,
  questionPageRefs,
}: {
  availablePageNumbers?: number[];
  pageCount: number;
  placeholder: AIPdfAssetPlaceholder;
  questionPageRefs: number[];
}) {
  const { bbox } = placeholder;
  const availablePages = availablePageNumbers?.length
    ? new Set(availablePageNumbers)
    : null;
  const lineagePages = new Set(
    questionPageRefs.filter(
      (page) => Number.isInteger(page) && page >= 1 && page <= pageCount,
    ),
  );
  const validSourceRegion =
    Number.isInteger(placeholder.page) &&
    placeholder.page >= 1 &&
    (availablePages
      ? availablePages.has(placeholder.page)
      : placeholder.page <= pageCount) &&
    finiteUnit(bbox.x) &&
    finiteUnit(bbox.y) &&
    finiteUnit(bbox.width) &&
    finiteUnit(bbox.height) &&
    bbox.width > 0 &&
    bbox.height > 0 &&
    bbox.x + bbox.width <= 1 &&
    bbox.y + bbox.height <= 1;

  const reason: AIPdfVisualProposalRejectionReason | null = !lineagePages.size
    ? "missing_question_lineage"
    : !lineagePages.has(placeholder.page)
      ? "page_outside_question_lineage"
      : !validSourceRegion
        ? "invalid_source_region"
        : null;

  return {
    reason,
    valid: reason === null,
  } as const;
}

function normalizedNumber(value: number) {
  return Number(value.toFixed(6)).toString();
}

export function visualProposalKey(placeholder: AIPdfAssetPlaceholder) {
  return [
    placeholder.page,
    normalizedNumber(placeholder.bbox.x),
    normalizedNumber(placeholder.bbox.y),
    normalizedNumber(placeholder.bbox.width),
    normalizedNumber(placeholder.bbox.height),
    placeholder.visual_role ?? "question_figure",
    placeholder.subquestion_ref ?? "",
    placeholder.shared_group_key ?? "",
  ].join(":");
}

export function contentSha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function safeSubquestionRef(value: string | undefined) {
  return /^[A-Za-z0-9._()-]{1,20}$/.test(value ?? "") ? value : null;
}

function safeSharedGroupKey(value: string | undefined) {
  return /^[A-Za-z0-9._-]{1,40}$/.test(value ?? "") ? value : null;
}

export function safeQuestionVisualAlt(placeholder: AIPdfAssetPlaceholder) {
  const role = placeholder.visual_role ?? "question_figure";
  const safeSubquestion = safeSubquestionRef(placeholder.subquestion_ref);
  const suffix = safeSubquestion
    ? ` for part ${safeSubquestion}`
    : "";

  return `${VISUAL_ALT_BY_ROLE[role]}${suffix}`;
}

function uuidFromDigestHex(value: string) {
  const bytes = Buffer.from(value.slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function deterministicQuestionAssetId({
  contentHash,
  questionId,
  sourceAssetId,
}: {
  contentHash: string;
  questionId: string;
  sourceAssetId: string;
}) {
  const digest = createHash("sha256")
    .update(
      [
        "edustruct-question-visual-v2",
        questionId,
        sourceAssetId,
        contentHash,
      ].join("\u0000"),
    )
    .digest("hex");

  return uuidFromDigestHex(digest);
}

export function visualEvidenceRecord({
  assetId,
  contentHash,
  placeholder,
  sourceAssetId,
}: {
  assetId: string;
  contentHash: string;
  placeholder: AIPdfAssetPlaceholder;
  sourceAssetId: string;
}) {
  return {
    ambiguity: placeholder.ambiguity ? "provider_flagged" : null,
    assetId,
    bbox: placeholder.bbox,
    confidence: placeholder.confidence ?? null,
    contentSha256: contentHash,
    contractVersion: AI_PDF_VISUAL_EVIDENCE_CONTRACT_VERSION,
    page: placeholder.page,
    required: placeholder.required,
    sharedGroupKey: safeSharedGroupKey(placeholder.shared_group_key),
    sourceAssetId,
    subquestionRef: safeSubquestionRef(placeholder.subquestion_ref),
    visualRole: placeholder.visual_role ?? "question_figure",
  };
}
