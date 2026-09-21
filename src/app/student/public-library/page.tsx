import { StudentPendingLink } from "@/components/student/student-pending-link";
import { StudentWorkspaceShell } from "@/components/student/student-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireStudentWorkspace } from "@/lib/auth/guards";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function StudentPublicLibraryPage() {
  const [, locale] = await Promise.all([requireStudentWorkspace(), getRequestLocale()]);

  return (
    <StudentWorkspaceShell
      eyebrow={translate(locale, "student.discovery")}
      title={translate(locale, "student.publicLibrary")}
      actions={
        <Button asChild>
          <StudentPendingLink href="/questions?workspace=student">
            {translate(locale, "student.browsePublicQuestions")}
          </StudentPendingLink>
        </Button>
      }
    />
  );
}
