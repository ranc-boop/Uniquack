import Link from "next/link";

import { TeacherComingSoonPanel, TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function TeacherAiParsingPage() {
  await requireTeacher();

  return (
    <TeacherWorkspaceShell
      title="AI Parsing"
      description="Teacher-owned material import stays review-gated before questions enter a bank."
      actions={
        <Button asChild>
          <Link href="/admin/imports/pdf">Open current import tool</Link>
        </Button>
      }
    >
      <TeacherWorkspaceNav />
      <TeacherComingSoonPanel
        title="Teacher import workspace"
        description="This teacher module routes to the current AI PDF import flow while keeping the product IA bank-first. Imported questions must still pass Review Draft approval before bank or assignment use."
        href="/admin/imports/pdf"
        hrefLabel="Open AI PDF import"
      />
    </TeacherWorkspaceShell>
  );
}
