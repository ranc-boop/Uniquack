import Link from "next/link";

import { TeacherComingSoonPanel, TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function TeacherPublishPage() {
  await requireTeacher();

  return (
    <TeacherWorkspaceShell
      title="Publish"
      description="Publish means assigning reviewed bank content to students, not globally publishing private teacher questions."
      actions={
        <Button asChild>
          <Link href="/teacher/classrooms">Choose a classroom</Link>
        </Button>
      }
    >
      <TeacherWorkspaceNav />
      <TeacherComingSoonPanel
        title="Assignment publishing shell"
        description="Use classrooms and assignments to deliver reviewed bank questions. Private bank content remains private unless a separate governance flow publishes it elsewhere."
        href="/teacher/classrooms"
        hrefLabel="Open classrooms"
      />
    </TeacherWorkspaceShell>
  );
}
