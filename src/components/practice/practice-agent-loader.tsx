"use client";

import dynamic from "next/dynamic";

const PracticeAgentClient = dynamic(
  () =>
    import("@/components/practice/practice-agent-client").then(
      (module) => module.PracticeAgentClient,
    ),
  {
    loading: () => (
      <div className="rounded-md border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
        Loading practice workspace...
      </div>
    ),
    ssr: false,
  },
);

export function PracticeAgentLoader({
  assignmentId,
}: {
  assignmentId?: string | null;
}) {
  return <PracticeAgentClient assignmentId={assignmentId ?? null} />;
}
