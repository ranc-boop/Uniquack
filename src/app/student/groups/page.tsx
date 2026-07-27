import Link from "next/link";

import {
  StudentComingSoonPanel,
  StudentWorkspaceShell,
} from "@/components/student/student-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireStudent } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function StudentStudyGroupsPage() {
  await requireStudent();

  return (
    <StudentWorkspaceShell
      eyebrow="Peer study"
      title="Study Groups"
      description="A future peer self-study space, separate from teacher classrooms."
      actions={
        <Button asChild variant="outline">
          <Link href="/student">Back to Dashboard</Link>
        </Button>
      }
    >
      <StudentComingSoonPanel
        description="Study Groups are planned as student collaboration spaces and do not grant access to teacher private Libraries."
        href="/student/classrooms"
        hrefLabel="View teacher classes"
        title="Study Group shell"
      />
    </StudentWorkspaceShell>
  );
}
