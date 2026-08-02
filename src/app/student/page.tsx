import { Suspense } from "react";

import { StudentDashboardLoadingContent } from "@/components/student/student-loading-skeletons";
import { StudentPendingLink } from "@/components/student/student-pending-link";
import { StudentModuleCard, StudentWorkspaceShell } from "@/components/student/student-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireStudentWorkspace } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { listStudentAssignedWork } from "@/lib/student-work";

export const dynamic = "force-dynamic";

function countDueSoon(value: string | null | undefined) {
  if (!value) return false;
  const due = new Date(value).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((due - today.getTime()) / 86_400_000);
  return days <= 7;
}

async function StudentDashboardOverview() {
  const profile = await requireStudentWorkspace();
  const supabase = await createClient();
  const assignments = await listStudentAssignedWork({
    studentId: profile.id,
    supabase,
  });
  const dueSoon = assignments.filter(
    (assignment) =>
      assignment.progressStatus !== "completed" && countDueSoon(assignment.due_at),
  ).length;
  const inProgress = assignments.filter(
    (assignment) => assignment.progressStatus === "in_progress",
  ).length;
  const completed = assignments.filter(
    (assignment) => assignment.progressStatus === "completed",
  ).length;

  return (
    <>
      <section className="grid gap-3 md:grid-cols-4">
        {[
          ["Assigned work", assignments.length],
          ["Due soon", dueSoon],
          ["In progress", inProgress],
          ["Completed", completed],
        ].map(([label, count]) => (
          <div className="student-panel p-4" key={label}>
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-950">{count}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <StudentModuleCard
          actionLabel="View assignments"
          eyebrow="Assigned"
          href="/student/work"
          status={assignments.length ? `${assignments.length} active` : "Empty"}
          title="My Work"
        />
        <StudentModuleCard
          actionLabel="Start a round"
          eyebrow="Practice"
          href="/practice"
          title="Practice"
        />
        <StudentModuleCard
          actionLabel="Review misses"
          eyebrow="Recovery"
          href="/mistakes"
          title="Mistakes"
        />
        <StudentModuleCard
          actionLabel="See progress"
          eyebrow="Evidence"
          href="/student/progress"
          title="Progress / Feedback"
        />
      </section>
    </>
  );
}

export default function StudentHomePage() {
  return (
    <StudentWorkspaceShell
      title="Student Dashboard"
      actions={
        <>
          <Button asChild>
            <StudentPendingLink href="/student/work">Open My Work</StudentPendingLink>
          </Button>
          <Button asChild variant="outline">
            <StudentPendingLink href="/practice">Start Practice</StudentPendingLink>
          </Button>
        </>
      }
    >
      <Suspense fallback={<StudentDashboardLoadingContent />}>
        <StudentDashboardOverview />
      </Suspense>

      <section className="grid gap-4">
        <StudentModuleCard
          actionLabel="Browse public questions"
          eyebrow="Discovery"
          href="/student/public-library"
          title="Public Library"
        />
      </section>

    </StudentWorkspaceShell>
  );
}
