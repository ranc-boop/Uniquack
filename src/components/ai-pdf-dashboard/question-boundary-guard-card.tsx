import Link from "next/link";

import { InlineMathText } from "@/components/math-content";
import { Button } from "@/components/ui/button";

type GuardFinding = {
  explanation?: unknown;
  issueKind?: unknown;
  pageRefs?: unknown;
  reasonCodes?: unknown;
  severity?: unknown;
  suggestedReviewAction?: unknown;
  visibleQuestionNumbers?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function stringList(value: unknown) {
  return asArray(value).map(String).map((item) => item.trim()).filter(Boolean);
}

function issueLabel(value: unknown) {
  const labels: Record<string, string> = {
    answer_alignment: "Check answer alignment",
    choices_only_fragment: "Check page boundary",
    cross_page_fragment: "Check page boundary",
    likely_duplicate: "Possible duplicate",
    packet_chunk_boundary_split: "Check page boundary",
    question_number_conflict: "Check question number",
    recovery_duplicate: "Possible duplicate",
    solution_only_fragment: "Check answer alignment",
    visual_association: "Check visual association",
  };

  return labels[String(value)] ?? "Structural review";
}

function actionLabel(value: unknown) {
  const labels: Record<string, string> = {
    ignore_if_intentional: "Ignore if intentional",
    review_answer_alignment: "Check answer alignment",
    review_keep_one: "Compare and keep one",
    review_manually: "Review source pages",
    review_merge_fragments: "Review fragments together",
    review_question_number_conflict: "Check source numbering",
    review_reassociate_visual: "Check visual association",
  };

  return labels[String(value)] ?? "Review manually";
}

function guardFromSummary(summary: unknown) {
  const root = asRecord(summary);
  const ai = asRecord(root.aiPdfImport);

  return asRecord(ai.questionBoundaryGuardPlan);
}

export function QuestionBoundaryGuardCard({
  reviewHref,
  value,
}: {
  reviewHref?: string | null;
  value: unknown;
}) {
  const guard = guardFromSummary(value);
  if (guard.version !== "question_boundary_guard_v1") return null;

  const duplicateCount = numberValue(guard.likelyDuplicateGroupCount);
  const boundaryCount = numberValue(guard.boundaryFragmentGroupCount);
  const associationCount = numberValue(guard.associationRiskCount);
  const highRiskCount = numberValue(guard.highRiskCount);
  const mediumRiskCount = numberValue(guard.mediumRiskCount);
  const lowRiskCount = numberValue(guard.lowRiskCount);
  const findings = [
    ...asArray(guard.duplicateGroups),
    ...asArray(guard.boundaryGroups),
    ...asArray(guard.associationRisks),
  ] as GuardFinding[];
  const hasIssues = findings.length > 0;
  const isFailed = guard.status === "failed";

  return (
    <section
      className={`rounded-md border p-3 text-sm ${
        isFailed
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : hasIssues
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-emerald-200 bg-emerald-50 text-emerald-950"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Structural review</p>
          <p className="mt-1 text-xs leading-5">
            {isFailed
              ? "Structural analysis was unavailable. Drafts remain private and require normal human review."
              : hasIssues
                ? `Review recommended: ${duplicateCount} possible duplicate${duplicateCount === 1 ? "" : "s"} and ${boundaryCount} boundary issue${boundaryCount === 1 ? "" : "s"}.`
                : "No likely duplicate or boundary conflicts were detected."}
          </p>
        </div>
        {reviewHref && hasIssues ? (
          <Button asChild size="sm" variant="outline">
            <Link href={reviewHref}>Open Review Drafts</Link>
          </Button>
        ) : null}
      </div>

      {!isFailed ? (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
          <p className="rounded border border-current/15 bg-white/45 px-2 py-1">
            High: {highRiskCount}
          </p>
          <p className="rounded border border-current/15 bg-white/45 px-2 py-1">
            Medium: {mediumRiskCount}
          </p>
          <p className="rounded border border-current/15 bg-white/45 px-2 py-1">
            Low: {lowRiskCount}
          </p>
          <p className="rounded border border-current/15 bg-white/45 px-2 py-1">
            Visual checks: {associationCount}
          </p>
        </div>
      ) : null}

      {findings.length ? (
        <details className="mt-3 rounded border border-current/15 bg-white/45 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-semibold">
            Review details ({findings.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {findings.slice(0, 8).map((finding, index) => {
              const questionNumbers = stringList(finding.visibleQuestionNumbers);
              const pages = stringList(finding.pageRefs);
              const reasonCodes = stringList(finding.reasonCodes);

              return (
                <li className="rounded border border-current/10 bg-white/55 p-2" key={`${String(finding.issueKind)}-${index}`}>
                  <p className="font-semibold">
                    {issueLabel(finding.issueKind)} - {String(finding.severity ?? "review")}
                  </p>
                  <InlineMathText
                    className="mt-1 leading-5"
                    compact
                    value={String(finding.explanation ?? "Review the source evidence.")}
                  />
                  <p className="mt-1 text-muted-foreground">
                    {questionNumbers.length ? `Question ${questionNumbers.join(", ")}` : "Question number unavailable"}
                    {pages.length ? ` | Pages ${pages.join(", ")}` : ""}
                    {` | Suggested: ${actionLabel(finding.suggestedReviewAction)}`}
                  </p>
                  {reasonCodes.length ? (
                    <details className="mt-1 text-muted-foreground">
                      <summary className="cursor-pointer">Technical evidence</summary>
                      <p className="mt-1 break-words">{reasonCodes.join(", ")}</p>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
