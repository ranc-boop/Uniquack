import { FeedbackText } from "@/components/math-content";
import { Badge } from "@/components/ui/badge";

type CoverageRisk = {
  kind: string;
  pageNumbers: number[];
  severity: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function numberList(value: unknown) {
  return asArray(value)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 1)
    .sort((left, right) => left - right);
}

function uniqueNumbers(values: number[]) {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function formatPageRanges(values: number[]) {
  const pages = uniqueNumbers(values);

  if (!pages.length) {
    return "-";
  }

  const ranges: string[] = [];
  let start = pages[0];
  let previous = pages[0];

  for (const page of pages.slice(1)) {
    if (page === previous + 1) {
      previous = page;
      continue;
    }

    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = page;
    previous = page;
  }

  ranges.push(start === previous ? String(start) : `${start}-${previous}`);

  return ranges.join(", ");
}

function riskKindLabel(kind: string) {
  const labels: Record<string, string> = {
    batch_coverage_low: "Low batch coverage",
    chunk_partial_failure: "Partial chunk failure",
    full_pdf_silent_partial_risk: "Full PDF silent partial risk",
    packet_coverage_low: "Low packet coverage",
    question_like_page_uncovered: "Question-like page uncovered",
    terminal_pages_missing_from_extraction: "Terminal pages missing",
  };

  return labels[kind] ?? kind.replaceAll("_", " ");
}

function recoveryReasonLabel(reason: string) {
  const labels: Record<string, string> = {
    failed_chunk_pages: "failed chunk pages",
    low_packet_coverage: "low packet coverage",
    terminal_uncovered_pages: "terminal uncovered pages",
    uncovered_question_like_pages: "uncovered question-like pages",
  };

  return labels[reason] ?? reason.replaceAll("_", " ");
}

function readRisks(auditPlan: Record<string, unknown>) {
  return asArray(auditPlan.risks)
    .map((risk): CoverageRisk | null => {
      const record = asRecord(risk);
      const kind = stringValue(record.kind, "unknown");
      const severity = stringValue(record.severity, "info");

      return {
        kind,
        pageNumbers: numberList(record.pageNumbers),
        severity,
      };
    })
    .filter((risk): risk is CoverageRisk => Boolean(risk));
}

function hasCoverageWarning({
  auditPlan,
  risks,
}: {
  auditPlan: Record<string, unknown>;
  risks: CoverageRisk[];
}) {
  const warningKinds = new Set([
    "terminal_pages_missing_from_extraction",
    "full_pdf_silent_partial_risk",
    "question_like_page_uncovered",
    "packet_coverage_low",
    "batch_coverage_low",
    "chunk_partial_failure",
  ]);

  return (
    stringValue(auditPlan.status) === "completed_with_warnings" ||
    risks.some((risk) => warningKinds.has(risk.kind))
  );
}

function planCount(
  plan: Record<string, unknown>,
  statsKey: string,
  listKey: string,
) {
  const stats = asRecord(plan.stats);
  const fromStats = numberValue(stats[statsKey], NaN);

  if (Number.isFinite(fromStats)) {
    return fromStats;
  }

  return asArray(plan[listKey]).length;
}

export function CoverageWarningCard({
  ai,
}: {
  ai: Record<string, unknown>;
}) {
  const auditPlan = asRecord(ai.extractionCoverageAuditPlan);
  const risks = readRisks(auditPlan);

  if (!hasCoverageWarning({ auditPlan, risks })) {
    return null;
  }

  const pageCoverage = asRecord(auditPlan.pageCoverage);
  const stats = asRecord(auditPlan.stats);
  const recoveryPlan = asRecord(ai.coverageRecoveryPlan);
  const recoveryRunPlan = asRecord(ai.coverageRecoveryRunPlan);
  const recoveryMergePlan = asRecord(ai.coverageRecoveryMergePlan);
  const recoveryExecution = asRecord(ai.coverageRecoveryExecution);
  const mergeStats = asRecord(recoveryMergePlan.stats);
  const terminalPages = numberList(pageCoverage.terminalUncoveredPages);
  const uncoveredQuestionLikePages = numberList(
    pageCoverage.uncoveredQuestionLikePages,
  );
  const highRiskCount =
    numberValue(stats.highRiskCount) ||
    risks.filter((risk) => risk.severity === "high").length;
  const mediumRiskCount = risks.filter(
    (risk) => risk.severity === "medium",
  ).length;
  const recoveryWindows = asArray(auditPlan.recommendedRecoveryWindows).map(
    (window) => asRecord(window),
  );
  const recoveryTaskCount = planCount(
    recoveryPlan,
    "recoveryTaskCount",
    "recoveryTasks",
  );
  const recoveryRequestCount = planCount(
    recoveryPlan,
    "requestDraftCount",
    "requestDrafts",
  );
  const dryRunReadyCount = numberValue(
    asRecord(recoveryRunPlan.stats).dryRunReadyCount,
  );
  const dryRunBlockedCount =
    numberValue(asRecord(recoveryRunPlan.stats).dryRunBlockedCount) +
    numberValue(asRecord(recoveryRunPlan.stats).dryRunSkippedCount);
  const futureSuggestionCount = numberValue(mergeStats.futureSuggestionCount);
  const duplicateGuardCount = numberValue(mergeStats.duplicateGuardCount);
  const humanReviewRequired =
    asRecord(recoveryMergePlan.mergePolicy).humanReviewRequired === true ||
    futureSuggestionCount > 0 ||
    duplicateGuardCount > 0;
  const terminalPageLabel = `Terminal missing pages: ${formatPageRanges(
    terminalPages,
  )}`;
  const uncoveredPageLabel = `Uncovered question-like pages: ${formatPageRanges(
    uncoveredQuestionLikePages,
  )}`;
  const riskCountLabel = `Risks: ${risks.length}`;
  const riskSummaryLabel = `High risks: ${highRiskCount} | Medium risks: ${mediumRiskCount}`;
  const recoveryWindowLabel = `Recovery windows: ${recoveryWindows.length}`;
  const recoveryPlanLabel = `Recovery plan: ${recoveryTaskCount} tasks / ${recoveryRequestCount} request drafts`;
  const dryRunLabel = `Dry run: ${dryRunReadyCount} ready / ${dryRunBlockedCount} blocked or skipped`;
  const mergePlanLabel = `Future suggestions: ${futureSuggestionCount} | Duplicate guards: ${duplicateGuardCount}`;
  const recoveryStatus = stringValue(recoveryExecution.status);
  const recoveryCopy =
    recoveryStatus === "queued"
      ? "Targeted recovery is waiting for available AI capacity."
      : recoveryStatus === "processing"
        ? "The system is rechecking the missing sections."
        : recoveryStatus === "completed"
          ? "Additional Review Drafts were recovered for teacher review."
          : recoveryStatus === "completed_no_new_drafts"
            ? "The missing sections were rechecked, but no additional usable drafts were found."
            : "Some likely question pages were not represented in the first extraction.";

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-amber-950">Coverage warning</p>
          <p className="mt-1 text-xs text-amber-900">
            Some pages or packets may need human review before this import is
            considered complete.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {stringValue(auditPlan.status, "unknown").replaceAll("_", " ")}
          </Badge>
          <Badge variant="outline">{riskCountLabel}</Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs text-amber-950 md:grid-cols-2">
        <p className="rounded border bg-background/70 p-2">{riskSummaryLabel}</p>
        <p className="rounded border bg-background/70 p-2">{terminalPageLabel}</p>
        <p className="rounded border bg-background/70 p-2">{uncoveredPageLabel}</p>
        <p className="rounded border bg-background/70 p-2">{recoveryWindowLabel}</p>
      </div>

      {risks.length ? (
        <div className="mt-3 space-y-1 text-xs text-amber-950">
          {risks.slice(0, 4).map((risk) => {
            const riskLabel = `${riskKindLabel(risk.kind)}${
              risk.pageNumbers.length
                ? ` on pages ${formatPageRanges(risk.pageNumbers)}`
                : ""
            } | ${risk.severity}`;

            return (
              <p key={`${risk.kind}-${risk.pageNumbers.join("-")}`}>
                {riskLabel}
              </p>
            );
          })}
          {risks.length > 4 ? (
            <details className="rounded border bg-background/70 p-2">
              <summary className="cursor-pointer font-medium">
                Show all coverage risks (+{risks.length - 4})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {risks.slice(4).map((risk) => {
                  const riskLabel = `${riskKindLabel(risk.kind)}${
                    risk.pageNumbers.length
                      ? ` on pages ${formatPageRanges(risk.pageNumbers)}`
                      : ""
                  } | ${risk.severity}`;

                  return (
                    <li key={`${risk.kind}-${risk.pageNumbers.join("-")}`}>
                      {riskLabel}
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {recoveryWindows.length ? (
        <div className="mt-3 rounded border bg-background/70 p-2 text-xs text-amber-950">
          <p className="font-medium">Recovery window summary</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {recoveryWindows.slice(0, 3).map((window) => {
              const pages = numberList(window.pageNumbers);
              const reason = recoveryReasonLabel(stringValue(window.reason));
              const windowId = stringValue(
                window.windowId,
                `${reason}-${pages.join("-")}`,
              );

              return (
                <li key={windowId}>
                  <FeedbackText
                    className="inline border-none bg-transparent p-0 text-xs text-amber-950"
                    compact
                    inline
                    value={reason}
                  />
                  : pages {formatPageRanges(pages)}
                </li>
              );
            })}
          </ul>
          {recoveryWindows.length > 3 ? (
            <p className="mt-1 text-amber-900">
              {recoveryWindows.length - 3} more recovery windows hidden from
              this compact view.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 text-xs text-amber-950 md:grid-cols-3">
        <p className="rounded border bg-background/70 p-2">{recoveryPlanLabel}</p>
        <p className="rounded border bg-background/70 p-2">{dryRunLabel}</p>
        <p className="rounded border bg-background/70 p-2">{mergePlanLabel}</p>
      </div>

      <p className="mt-3 text-xs text-amber-900">
        {recoveryCopy}
        {humanReviewRequired ? " Human review required." : ""}
      </p>
    </div>
  );
}
