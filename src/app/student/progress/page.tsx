import Link from "next/link";

import { StudentWorkspaceShell } from "@/components/student/student-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireStudent } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { listStudentAssignedWork } from "@/lib/student-work";

export const dynamic = "force-dynamic";

export default async function StudentProgressPage() {
  const profile = await requireStudent();
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

  return (
    <StudentWorkspaceShell
      eyebrow="Evidence"
      title="Progress / Feedback"
      description="Assignment evidence and feedback status from your student workspace."
      actions={
        <Button asChild variant="outline">
          <Link href="/student/work">Open My Work</Link>
        </Button>
      }
    >
      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["Assigned", assignments.length],
          ["In progress", inProgress],
          ["Completed", completed],
        ].map(([label, count]) => (
          <div className="student-panel p-4" key={label}>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{count}</p>
          </div>
        ))}
      </section>

      <section className="student-panel p-5">
        <h2 className="text-lg font-bold text-slate-950">Feedback history</h2>
        <p className="student-muted mt-2">
          Detailed feedback cards will appear here as assigned Practice evidence grows.
        </p>
      </section>
    </StudentWorkspaceShell>
  );
}
