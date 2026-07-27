"use client";

import dynamic from "next/dynamic";

import { PracticeWorkspaceErrorBoundary } from "@/components/practice/practice-workspace-error-boundary";
import { PracticeWorkspaceSkeleton } from "@/components/practice/practice-session-scope-panels";

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
}: {
  assignmentId?: string | null;
}) {
  return (
    <PracticeWorkspaceErrorBoundary>
      <PracticeAgentClient assignmentId={assignmentId ?? null} />
    </PracticeWorkspaceErrorBoundary>
  );
}
