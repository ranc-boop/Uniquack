import { AlertCircle, ShieldAlert } from "lucide-react";

import type { TeacherReviewGuidanceItem } from "@/lib/questions/teacher-review-guidance";

function FixedGuidanceText({ value }: { value: string }) {
  return <>{value}</>;
}

export function TeacherReviewGuidance({
  findings,
}: {
  findings: TeacherReviewGuidanceItem[];
}) {
  if (!findings.length) return null;

  return (
    <ul aria-label="Review guidance" className="mt-3 space-y-2">
      {findings.map((finding) => {
        const blocking = finding.level === "blocking";
        const Icon = blocking ? ShieldAlert : AlertCircle;

        return (
          <li
            className={
              blocking
                ? "flex gap-2 border-l-2 border-rose-400 bg-rose-50/70 px-3 py-2 text-rose-950"
                : "flex gap-2 border-l-2 border-amber-400 bg-amber-50/70 px-3 py-2 text-amber-950"
            }
            key={`${finding.level}:${finding.category}`}
          >
            <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 text-sm leading-5">
              <p className="font-semibold">
                <FixedGuidanceText value={finding.title} />
              </p>
              <p>
                <FixedGuidanceText value={finding.summary} />
              </p>
              {finding.sourcePages.length ? (
                <p className="mt-1 text-xs font-medium">
                  Source page{finding.sourcePages.length === 1 ? "" : "s"}:{" "}
                  {finding.sourcePages.join(", ")}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
