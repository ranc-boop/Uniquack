import { StudentPendingLink } from "@/components/student/student-pending-link";
import { StudentWorkspaceShell } from "@/components/student/student-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireStudentWorkspace } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function StudentPublicLibraryPage() {
  await requireStudentWorkspace();

  return (
    <StudentWorkspaceShell
      eyebrow="Discovery"
      title="Public Library"
      actions={
        <Button asChild>
          <StudentPendingLink href="/questions?workspace=student">
            Browse public questions
          </StudentPendingLink>
        </Button>
      }
    />
  );
}
