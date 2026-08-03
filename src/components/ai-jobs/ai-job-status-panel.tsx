import Link from "next/link";

import { Clock3, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

import { AIJobStatusPoller } from "@/components/ai-jobs/ai-job-status-poller";
import { isActiveAIProviderJob, jobStatusCopy } from "@/lib/ai-jobs/policy";
import type { AIProviderJobSafeStatus } from "@/lib/ai-jobs/types";

function jobKindLabel(jobKind: AIProviderJobSafeStatus["job_kind"]) {
  if (jobKind === "ai_pdf_extract") return "AI PDF Parsing";
  if (jobKind === "ai_pdf_coverage_recovery") return "Targeted PDF recovery";
  return "Blueprint generation";
}

function statusTone(status: AIProviderJobSafeStatus["status"]) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-900";
  if (status === "retry_wait") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "cancelled") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-sky-200 bg-sky-50 text-sky-950";
}

function safeCount(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export function AIJobStatusPanel({
  cancelAction,
  jobs,
  reviewHref,
  retryAction,
  returnTo,
  title = "AI work status",
}: {
  cancelAction?: (formData: FormData) => void | Promise<void>;
  jobs: AIProviderJobSafeStatus[];
  reviewHref?: string;
  retryAction?: (formData: FormData) => void | Promise<void>;
  returnTo?: string;
  title?: string;
}) {
  if (!jobs.length) return null;

  const hasActiveJob = jobs.some(isActiveAIProviderJob);

  return (
    <section className="rounded-lg border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5">
      <AIJobStatusPoller active={hasActiveJob} />
      <div className="flex items-start gap-3">
        <Sparkles aria-hidden="true" className="mt-0.5 h-5 w-5 text-sky-700" />
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      </div>
      <div className="mt-4 space-y-3">
        {jobs.map((job) => {
          const createdDraftCount = safeCount(job.safe_result.createdDraftCount);
          const providerInferenceAttempts = safeCount(
            job.safe_result.providerInferenceAttempts,
          );
          const providerNetworkRequests = safeCount(
            job.safe_result.providerNetworkRequests,
          );

          return (
          <div className={`rounded-lg border p-3 ${statusTone(job.status)}`} key={job.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold">{jobKindLabel(job.job_kind)}</p>
              <span className="rounded-full border border-current/20 bg-white/60 px-2.5 py-1 text-xs font-bold capitalize">
                {job.status.replace("_", " ")}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6">{jobStatusCopy(job)}</p>
            {job.status === "completed" && createdDraftCount !== null ? (
              <p className="mt-2 text-xs font-semibold">
                {createdDraftCount} Review Draft{createdDraftCount === 1 ? "" : "s"} created
                {providerInferenceAttempts !== null && providerNetworkRequests !== null
                  ? ` / ${providerInferenceAttempts} inference attempt${providerInferenceAttempts === 1 ? "" : "s"} / ${providerNetworkRequests} Provider request${providerNetworkRequests === 1 ? "" : "s"}`
                  : ""}
              </p>
            ) : null}
            {isActiveAIProviderJob(job) || job.status === "retry_wait" ? (
              <p className="mt-2 text-xs font-semibold">
                Durable run {job.execution_attempt_count} of {job.max_execution_attempts}
              </p>
            ) : null}
            {job.status === "retry_wait" ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold">
                <Clock3 aria-hidden="true" className="h-3.5 w-3.5" />
                Retry is scheduled automatically; no new upload is needed.
              </p>
            ) : null}
            {hasActiveJob && isActiveAIProviderJob(job) ? (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold">
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                This panel refreshes while work is active.
              </p>
            ) : null}
            {job.status === "completed" && reviewHref ? (
              <Link className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold underline underline-offset-4" href={reviewHref}>
                <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                Open Review Drafts
              </Link>
            ) : null}
            {returnTo && cancelAction && ["queued", "retry_wait"].includes(job.status) ? (
              <form action={cancelAction} className="mt-3">
                <input name="jobId" type="hidden" value={job.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <button className="text-sm font-bold underline underline-offset-4" type="submit">
                  Cancel queued run
                </button>
              </form>
            ) : null}
            {returnTo && retryAction && job.status === "failed" ? (
              <form action={retryAction} className="mt-3">
                <input name="jobId" type="hidden" value={job.id} />
                <input name="returnTo" type="hidden" value={returnTo} />
                <button className="text-sm font-bold underline underline-offset-4" type="submit">
                  Retry this run
                </button>
              </form>
            ) : null}
          </div>
          );
        })}
      </div>
    </section>
  );
}
