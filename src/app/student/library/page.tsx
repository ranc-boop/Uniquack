import Link from "next/link";

import {
  StudentComingSoonPanel,
  StudentWorkspaceShell,
} from "@/components/student/student-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireStudent } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function StudentStudyLibraryPage() {
  await requireStudent();

  return (
    <StudentWorkspaceShell
      eyebrow="Self-study"
      title="Study Library"
      description="Your saved questions, study sets, and mistake collections will live here."
      actions={
        <Button asChild variant="outline">
          <Link href="/student">Back to Dashboard</Link>
        </Button>
      }
    >
      <StudentComingSoonPanel
        description="This shell reserves the student-owned library space without creating a new backend yet."
        href="/student/work"
        hrefLabel="Use My Work today"
        title="Student-owned library foundation"
      />
    </StudentWorkspaceShell>
  );
}
