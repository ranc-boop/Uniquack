"use client";

import dynamic from "next/dynamic";

import { PracticeWorkspaceErrorBoundary } from "@/components/practice/practice-workspace-error-boundary";

const PracticeAgentClient = dynamic(
  () =>
    import("@/components/practice/practice-agent-client").then(
      (module) => module.PracticeAgentClient,
    ),
  {
    loading: () => (
      <section aria-busy="true" aria-live="polite" className="mx-auto max-w-3xl space-y-6 py-10" role="status">
        <span className="sr-only">Loading practice workspace…</span>
        <div className="h-7 w-40 animate-pulse rounded bg-slate-100" />
        <div className="h-11 w-full animate-pulse rounded-2xl bg-slate-100" />
        <div className="space-y-3">
          <div className="h-5 w-3/4 animate-pulse rounded bg-slate-100" />
          <div className="h-5 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-5 w-5/6 animate-pulse rounded bg-slate-100" />
        </div>
      </section>
    ),
    ssr: false,
  },
);

export function PracticeAgentLoader({
  assignmentId,
}: {
  assignmentId?: string | null;
}) {
  return (
    <PracticeWorkspaceErrorBoundary>
      <PracticeAgentClient assignmentId={assignmentId ?? null} />
    </PracticeWorkspaceErrorBoundary>
  );
}
