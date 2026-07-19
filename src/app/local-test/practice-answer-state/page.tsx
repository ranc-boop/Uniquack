import { notFound } from "next/navigation";

import { PracticeAgentClient } from "@/components/practice/practice-agent-client";

export const dynamic = "force-dynamic";

const LOCAL_BROWSER_TEST_ENV = "PRACTICE_ANSWER_STATE_LOCAL_BROWSER_E2E";
const LOCAL_BROWSER_TEST_CONFIRMATION = "ENABLED";

export default function PracticeAnswerStateLocalBrowserPage() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env[LOCAL_BROWSER_TEST_ENV] !== LOCAL_BROWSER_TEST_CONFIRMATION
  ) {
    notFound();
  }

  return (
    <PracticeAgentClient
      assignmentId="LOCAL_BROWSER_ASSIGNMENT"
      testOnlyDelayedHydration
    />
  );
}
