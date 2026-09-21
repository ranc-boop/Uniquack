import { StudentPendingLink } from "@/components/student/student-pending-link";
import { StudentWorkspaceShell } from "@/components/student/student-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireStudentWorkspace } from "@/lib/auth/guards";
import { formatNumber } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { listStudentAssignedWork } from "@/lib/student-work";

export const dynamic = "force-dynamic";

export default async function StudentProgressPage() {
  const [profile, locale] = await Promise.all([requireStudentWorkspace(), getRequestLocale()]);
  const supabase = await createClient();
  const assignments = await listStudentAssignedWork({
    studentId: profile.id,
    supabase,
  });
  const completed = assignments.filter(
    (assignment) => assignment.progressStatus === "completed",
  ).length;
  const inProgress = assignments.filter(
    (assignment) => assignment.progressStatus === "in_progress",
  ).length;
  const metrics: Array<[string, number]> = [
    [translate(locale, "student.assigned"), assignments.length],
    [translate(locale, "student.inProgress"), inProgress],
    [translate(locale, "student.completed"), completed],
  ];

  return (
    <StudentWorkspaceShell
      eyebrow={translate(locale, "student.evidence")}
      title={translate(locale, "student.progressFeedback")}
      actions={
        <Button asChild variant="outline">
          <StudentPendingLink href="/student/work">{translate(locale, "student.openMyWork")}</StudentPendingLink>
        </Button>
      }
    >
      <section className="grid gap-3 md:grid-cols-3">
        {metrics.map(([label, count]) => (
          <div className="student-panel p-4" key={label}>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{formatNumber(locale, count)}</p>
          </div>
        ))}
      </section>
    </StudentWorkspaceShell>
  );
}
