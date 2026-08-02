"use client";

import dynamic from "next/dynamic";

import { PracticeWorkspaceErrorBoundary } from "@/components/practice/practice-workspace-error-boundary";
import { PracticeWorkspaceSkeleton } from "@/components/practice/practice-workspace-skeleton";

const PracticeAgentClient = dynamic(
  () =>
    import("@/components/practice/practice-agent-client").then(
      (module) => module.PracticeAgentClient,
    ),
  {
    loading: () => <PracticeWorkspaceSkeleton />,
    ssr: false,
  },
);

export function PracticeAgentLoader({
  assignmentId,
  exitHref,
}: {
  assignmentId?: string | null;
  exitHref: string;
}) {
  return (
    <PracticeWorkspaceErrorBoundary>
      <PracticeAgentClient
        assignmentId={assignmentId ?? null}
        exitHref={exitHref}
      />
    </PracticeWorkspaceErrorBoundary>
  );
}
