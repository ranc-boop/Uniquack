import crypto from "node:crypto";

export const AI_PDF_FENCED_SUMMARY_MAX_BYTES = 65_536;

export const AI_PDF_TERMINAL_TRANSIENT_PLAN_KEYS = [
  "preanalysis",
  "packetPlan",
  "extractionBatchPlan",
  "providerRequestPlan",
  "providerRunPlan",
  "adaptiveRereadPlan",
  "adaptiveRereadProviderRequestPlan",
  "adaptiveRereadRunPlan",
  "adaptiveRereadMergePlan",
  "taggingV2Plan",
  "taxonomyBootstrapPlan",
  "taxonomyReviewPlan",
  "taxonomyPersistencePlan",
  "taxonomyTagTaxonomyPlan",
  "taxonomyQuestionTaggingPlan",
  "taxonomyTagReviewActionPlan",
  "extractionCoverageAuditPlan",
  "coverageRecoveryRunPlan",
  "coverageRecoveryMergePlan",
] as const;

type ArchivedPlan = {
  byteCount: number;
  contentHash: string;
  status?: string;
  version?: string;
  warningCount: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function jsonBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function safeContractToken(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return /^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(normalized)
    ? normalized
    : undefined;
}

function archivePlan(value: unknown): ArchivedPlan {
  const serialized = JSON.stringify(value) ?? "null";
  const record = asRecord(value);
  const status = safeContractToken(record.status);
  const version = safeContractToken(record.version);

  return {
    byteCount: Buffer.byteLength(serialized, "utf8"),
    contentHash: crypto.createHash("sha256").update(serialized).digest("hex"),
    ...(status ? { status } : {}),
    ...(version ? { version } : {}),
    warningCount: Array.isArray(record.warnings) ? record.warnings.length : 0,
  };
}

/**
 * Replaces execution-only planning payloads after review evidence is derived.
 * Terminal lineage, selective page mapping, recovery requests, and boundary
 * findings remain available to the Teacher and recovery paths.
 */
export function compactAIPdfTerminalSummary(
  summary: Record<string, unknown>,
): Record<string, unknown> {
  const aiPdfImport = asRecord(summary.aiPdfImport);
  const archivedPlans: Record<string, ArchivedPlan> = {};
  const compactAiPdfImport = { ...aiPdfImport };

  for (const key of AI_PDF_TERMINAL_TRANSIENT_PLAN_KEYS) {
    const value = compactAiPdfImport[key];
    if (value === undefined) continue;
    archivedPlans[key] = archivePlan(value);
    delete compactAiPdfImport[key];
  }

  if (!Object.keys(archivedPlans).length) return summary;

  const existingArchive = asRecord(aiPdfImport.executionPlanArchive);
  const plans = {
    ...asRecord(existingArchive.plans),
    ...archivedPlans,
  };

  compactAiPdfImport.executionPlanArchive = {
    archivedPlanCount: Object.keys(plans).length,
    originalSummaryBytes: Math.max(
      Number(existingArchive.originalSummaryBytes) || 0,
      jsonBytes(summary),
    ),
    plans,
    version: "ai_pdf_execution_plan_archive_v1",
  };

  return {
    ...summary,
    aiPdfImport: compactAiPdfImport,
  };
}
