import Link from "next/link";

import { TeacherComingSoonPanel, TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function TeacherProgressPage() {
  await requireTeacher();

  return (
    <TeacherWorkspaceShell
      title="Progress"
      description="Practice evidence returns to teachers after assigned students work through classroom-delivered questions."
      actions={
        <Button asChild variant="outline">
          <Link href="/teacher/classrooms">Review classroom work</Link>
        </Button>
      }
    >
      <TeacherWorkspaceNav />
      <TeacherComingSoonPanel
        title="Evidence and progress shell"
        description="This module anchors teacher insight after assignment and practice. It intentionally does not expose student-private practice outside assigned work and classroom context."
        href="/teacher/classrooms"
        hrefLabel="Open classrooms"
      />
    </TeacherWorkspaceShell>
  );
}
