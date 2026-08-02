import Link from "next/link";

import { InlineMathText } from "@/components/math-content";
import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { QuestionBoundaryGuardCard } from "@/components/ai-pdf-dashboard/question-boundary-guard-card";
import { friendlyAIPdfPhaseLabel } from "@/lib/ai-pdf-import/display";
import type { BankImportBatchSummary } from "@/lib/question-banks";

import {
  BankBadge,
  BankSectionHeader,
} from "./bank-ui";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Unknown";
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

function safeTeacherImportText(value: string | null) {
  if (!value) return null;

  if (
    /\b(?:503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|rate[-\s]?limit|gemini|deepseek|provider response|authorization|api[_ -]?key|bearer)\b/i.test(
      value,
    )
  ) {
    return "The AI service is temporarily busy. Your work is safe, and you can retry later.";
  }

  if (/\b(?:timeout|timed out|deadline exceeded)\b/i.test(value)) {
    return "This is taking longer than usual. Your work is safe, and you can retry later.";
  }

  return value.slice(0, 500);
}

function summarizeImportBatch(batch: BankImportBatchSummary) {
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
      .map((warning) => safeTeacherImportText(warning))
      .filter((warning): warning is string => Boolean(warning)),
  ).slice(0, 3);
  const retryable = summary.retryable === true || aiPdfImport.retryable === true;
  const phase =
    asString(aiPdfImport.phase) ?? asString(summary.phase) ?? batch.status;
  const fileLabel =
    asString(aiPdfImport.fileName) ??
    asString(summary.fileName) ??
    (batch.source_type === "ai_pdf" ? "Private PDF source" : "Imported source");
  const detail = safeTeacherImportText(
    asString(aiPdfImport.detail) ??
    asString(summary.detail) ??
    (retryable
      ? "The AI service is temporarily busy. Your work is safe, and you can retry later."
      : null),
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

function coverageRecoveryState(batch: BankImportBatchSummary) {
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
      ? "Targeted recovery is waiting for available AI capacity."
      : status === "processing"
        ? "The system is rechecking the missing sections."
        : status === "completed"
          ? "Additional Review Drafts were recovered for teacher review."
          : status === "completed_no_new_drafts"
            ? "The missing sections were rechecked, but no additional usable drafts were found."
            : eligible
              ? "Some likely question pages were not represented in the first extraction."
              : null;
  return { copy, eligible, status };
}

function importStatusLabel(
  batch: BankImportBatchSummary,
  retryable: boolean,
  phase: string,
) {
  if (retryable) {
    return "Retryable import";
  }

  if (batch.status === "imported") {
    return "Imported";
  }

  if (batch.status === "failed") {
    return "Failed";
  }

  if (batch.status === "validating") {
    return "Processing";
  }

  if (phase === "queued") {
    return "Queued";
  }

  if (phase === "queue_processing") {
    return "Processing";
  }

  if (batch.status === "draft" || batch.status === "ready") {
    return "Pending";
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
}: {
  bankName?: string;
  canQueueCoverageRecovery?: boolean;
  coverageRecoveryAction?: (formData: FormData) => void | Promise<void>;
  importBatches: BankImportBatchSummary[];
}) {
  return (
    <aside className="rounded-lg border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
      <BankSectionHeader
        title="Recent AI Parsing status"
      />
      <div className="space-y-3 p-5">
        {importBatches.length ? (
          importBatches.map((batch) => {
            const status = summarizeImportBatch(batch);
            const recovery = coverageRecoveryState(batch);
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
                        {formatDate(batch.created_at)}
                      </p>
                    </div>
                    <BankBadge tone={importStatusTone(batch, status.retryable, status.phase)}>
                      {importStatusLabel(batch, status.retryable, status.phase)}
                    </BankBadge>
                  </div>

                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <dt className="font-semibold text-slate-500">Target Library</dt>
                      <dd className="mt-1 break-words font-bold text-slate-900">
                        {bankName ?? "Selected Library"}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <dt className="font-semibold text-slate-500">Phase</dt>
                      <dd className="mt-1 break-words font-bold text-slate-900">
                        {friendlyAIPdfPhaseLabel(status.phase)}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <dt className="font-semibold text-slate-500">Drafts</dt>
                      <dd className="mt-1 font-bold text-slate-900">
                        {status.draftCount}
                      </dd>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <dt className="font-semibold text-slate-500">Warnings</dt>
                      <dd className="mt-1 font-bold text-slate-900">
                        {status.warningCount}
                      </dd>
                    </div>
                  </dl>

                  {status.retryable ? (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">
                      This run could not be completed. Nothing was published or
                      assigned; retry later without uploading the file again.
                    </p>
                  ) : null}

                  {status.zeroDrafts ? (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-700">
                      Zero drafts were created. Review the status detail before
                      retrying or using a smaller source file.
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
                            pendingLabel="Queueing recovery..."
                            size="sm"
                            variant="outline"
                          >
                            Recheck missing sections
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
                        <p className="font-bold">Warnings to inspect</p>
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
                      <Link href={reviewHref}>Open Review Drafts</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            No Library imports yet. Start with AI Parsing, then review
            drafts before adding anything to the bank.
          </p>
        )}
      </div>
    </aside>
  );
}
