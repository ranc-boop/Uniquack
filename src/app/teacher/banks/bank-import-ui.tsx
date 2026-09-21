import Link from "next/link";

import { InlineMathText } from "@/components/math-content";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { QuestionBoundaryGuardCard } from "@/components/ai-pdf-dashboard/question-boundary-guard-card";
import { friendlyAIPdfPhaseLabel } from "@/lib/ai-pdf-import/display";
import { formatDateTime, type Locale } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";
import type { BankImportBatchSummary } from "@/lib/question-banks";

import {
  BankBadge,
  BankSectionHeader,
} from "./bank-ui";

function formatDate(value: string | null, locale: Locale) {
  return value ? formatDateTime(locale, value) : translate(locale, "common.unknown");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) =>
          typeof item === "string" ? item.trim() : JSON.stringify(item),
        )
        .filter(Boolean)
    : [];
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function safeTeacherImportText(value: string | null, locale: Locale) {
  if (!value) return null;

  if (
    /\b(?:503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|rate[-\s]?limit|gemini|deepseek|provider response|authorization|api[_ -]?key|bearer)\b/i.test(
      value,
    )
  ) {
    return translate(locale, "teacherLibrary.aiServiceBusy");
  }

  if (/\b(?:timeout|timed out|deadline exceeded)\b/i.test(value)) {
    return translate(locale, "teacherLibrary.aiServiceSlow");
  }

  return value.slice(0, 500);
}

function summarizeImportBatch(batch: BankImportBatchSummary, locale: Locale) {
  const summary = asRecord(batch.summary);
  const aiPdfImport = asRecord(summary.aiPdfImport);
  const createdQuestions = Array.isArray(summary.createdQuestions)
    ? summary.createdQuestions
    : [];
  const draftCount =
    asNumber(summary.createdCount) ??
    asNumber(aiPdfImport.createdQuestionCount) ??
    createdQuestions.length;
  const warnings = uniqueStrings(
    [...asStringList(summary.validationErrorReasons), ...asStringList(aiPdfImport.warnings)]
      .map((warning) => safeTeacherImportText(warning, locale))
      .filter((warning): warning is string => Boolean(warning)),
  ).slice(0, 3);
  const retryable = summary.retryable === true || aiPdfImport.retryable === true;
  const phase =
    asString(aiPdfImport.phase) ?? asString(summary.phase) ?? batch.status;
  const fileLabel =
    asString(aiPdfImport.fileName) ??
    asString(summary.fileName) ??
    (batch.source_type === "ai_pdf"
      ? translate(locale, "teacherLibrary.privatePdfSource")
      : translate(locale, "teacherLibrary.importedSource"));
  const detail = safeTeacherImportText(
    asString(aiPdfImport.detail) ??
    asString(summary.detail) ??
    (retryable
      ? translate(locale, "teacherLibrary.aiServiceBusy")
      : null),
    locale,
  );

  return {
    detail,
    draftCount,
    fileLabel,
    phase,
    retryable,
    warnings,
    warningCount: warnings.length,
    zeroDrafts:
      (batch.status === "failed" || batch.status === "imported") &&
      draftCount === 0,
  };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function coverageRecoveryState(batch: BankImportBatchSummary, locale: Locale) {
  const summary = asRecord(batch.summary);
  const ai = asRecord(summary.aiPdfImport);
  const plan = asRecord(ai.coverageRecoveryPlan);
  const execution = asRecord(ai.coverageRecoveryExecution);
  const requestDrafts = asArray(plan.requestDrafts);
  const eligible =
    batch.source_type === "ai_pdf" &&
    ["imported", "failed"].includes(batch.status) &&
    plan.sourceAuditPlanPresent === true &&
    requestDrafts.length > 0;
  const status = asString(execution.status);
  const copy =
    status === "queued"
      ? translate(locale, "teacherLibrary.recoveryQueued")
      : status === "processing"
        ? translate(locale, "teacherLibrary.recoveryProcessing")
        : status === "completed"
          ? translate(locale, "teacherLibrary.recoveryCompleted")
          : status === "completed_no_new_drafts"
            ? translate(locale, "teacherLibrary.recoveryNoNewDrafts")
            : eligible
              ? translate(locale, "teacherLibrary.recoverySomePages")
              : null;
  return { copy, eligible, status };
}

function importStatusLabel(
  batch: BankImportBatchSummary,
  retryable: boolean,
  phase: string,
  locale: Locale,
) {
  if (retryable) {
    return translate(locale, "teacherLibrary.retryableImport");
  }

  if (batch.status === "imported") {
    return translate(locale, "teacherLibrary.importedStatus");
  }

  if (batch.status === "failed") {
    return translate(locale, "teacherLibrary.failedStatus");
  }

  if (batch.status === "validating") {
    return translate(locale, "teacherLibrary.processingStatus");
  }

  if (phase === "queued") {
    return translate(locale, "teacherLibrary.queuedStatus");
  }

  if (phase === "queue_processing") {
    return translate(locale, "teacherLibrary.processingStatus");
  }

  if (batch.status === "draft" || batch.status === "ready") {
    return translate(locale, "teacherLibrary.pendingStatus");
  }

  return batch.status;
}

function importStatusTone(
  batch: BankImportBatchSummary,
  retryable: boolean,
  phase: string,
): "amber" | "blue" | "cyan" | "rose" | "slate" | "sky" {
  if (retryable) {
    return "amber";
  }

  if (batch.status === "imported") {
    return "cyan";
  }

  if (batch.status === "failed") {
    return "rose";
  }

  if (batch.status === "validating") {
    return "blue";
  }

  if (phase === "queue_processing") {
    return "blue";
  }

  if (phase === "queued") {
    return "sky";
  }

  if (batch.status === "draft" || batch.status === "ready") {
    return "sky";
  }

  return "slate";
}

export function RecentBankImportsPanel({
  bankName,
  canQueueCoverageRecovery = false,
  coverageRecoveryAction,
  importBatches,
  locale,
}: {
  bankName?: string;
  canQueueCoverageRecovery?: boolean;
  coverageRecoveryAction?: (formData: FormData) => void | Promise<void>;
  importBatches: BankImportBatchSummary[];
  locale: Locale;
}) {
  return (
    <aside className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
      <BankSectionHeader
        title={translate(locale, "teacherLibrary.recentImportsTitle")}
      />
      <div className="space-y-3 p-5">
        {importBatches.length ? (
          importBatches.map((batch) => {
            const status = summarizeImportBatch(batch, locale);
            const recovery = coverageRecoveryState(batch, locale);
            const reviewHref = batch.target_bank_id
              ? `/teacher/banks/${batch.target_bank_id}/review`
              : null;

            return (
              <div
                className="rounded-xl border border-slate-200 bg-white p-4"
                key={batch.id}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">
                        {status.fileLabel}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDate(batch.created_at, locale)}
                      </p>
                    </div>
                    <BankBadge tone={importStatusTone(batch, status.retryable, status.phase)}>
                      {importStatusLabel(batch, status.retryable, status.phase, locale)}
                    </BankBadge>
                  </div>

                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <dt className="font-semibold text-slate-500">
                        {translate(locale, "teacherLibrary.targetLibrary")}
                      </dt>
                      <dd className="mt-1 break-words font-bold text-slate-900">
                        {bankName ?? translate(locale, "teacherLibrary.selectedLibrary")}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <dt className="font-semibold text-slate-500">
                        {translate(locale, "teacherLibrary.phase")}
                      </dt>
                      <dd className="mt-1 break-words font-bold text-slate-900">
                        {friendlyAIPdfPhaseLabel(status.phase)}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <dt className="font-semibold text-slate-500">
                        {translate(locale, "teacherLibrary.drafts")}
                      </dt>
                      <dd className="mt-1 font-bold text-slate-900">
                        {status.draftCount}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <dt className="font-semibold text-slate-500">
                        {translate(locale, "teacherLibrary.warnings")}
                      </dt>
                      <dd className="mt-1 font-bold text-slate-900">
                        {status.warningCount}
                      </dd>
                    </div>
                  </dl>

                  {status.retryable ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">
                      {translate(locale, "teacherLibrary.retryableMessage")}
                    </p>
                  ) : null}

                  {status.zeroDrafts ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-700">
                      {translate(locale, "teacherLibrary.zeroDrafts")}
                    </p>
                  ) : null}

                  {status.detail ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                      {status.detail}
                    </p>
                  ) : null}

                  {recovery.copy ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">
                      <p>{recovery.copy}</p>
                      {recovery.eligible &&
                      canQueueCoverageRecovery &&
                      coverageRecoveryAction &&
                      !["queued", "processing", "completed"].includes(recovery.status ?? "") ? (
                        <form action={coverageRecoveryAction} className="mt-3">
                          <input name="bankId" type="hidden" value={batch.target_bank_id ?? ""} />
                          <input name="batchId" type="hidden" value={batch.id} />
                          <FormSubmitButton
                            pendingLabel={translate(locale, "teacherLibrary.queueRecoveryPending")}
                            size="sm"
                            variant="outline"
                          >
                            {translate(locale, "teacherLibrary.recheckMissingSections")}
                          </FormSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  ) : null}

                  <QuestionBoundaryGuardCard
                    reviewHref={reviewHref}
                    value={batch.summary}
                  />

                  {status.warnings.length ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                        <p className="font-bold">
                          {translate(locale, "teacherLibrary.warningsToInspect")}
                        </p>
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {status.warnings.map((warning) => (
                            <li key={warning}>
                              <InlineMathText compact value={warning} />
                            </li>
                          ))}
                        </ul>
                    </div>
                  ) : null}

                  {reviewHref ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={reviewHref}>
                        {translate(locale, "teacherLibrary.openReviewDrafts")}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            {translate(locale, "teacherLibrary.noLibraryImports")}
          </p>
        )}
      </div>
    </aside>
  );
}
