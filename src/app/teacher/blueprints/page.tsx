import Link from "next/link";

import { TeacherComingSoonPanel, TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function TeacherBlueprintsPage() {
  await requireTeacher();

  return (
    <TeacherWorkspaceShell
      title="Blueprint"
      description="Blueprints are reusable assessment patterns reviewed before they support original question drafting."
      actions={
        <Button asChild variant="outline">
          <Link href="/admin/blueprints">Open current blueprint library</Link>
        </Button>
      }
    >
      <TeacherWorkspaceNav />
      <TeacherComingSoonPanel
        title="Teacher blueprint library shell"
        description="The current Blueprint Library remains the reviewed source for reusable patterns. This teacher route reserves the product home for blueprint review without exposing generation as a shortcut."
        href="/admin/blueprints"
        hrefLabel="Open Blueprint Library"
      />
    </TeacherWorkspaceShell>
  );
}
