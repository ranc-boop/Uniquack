import Link from "next/link";

import { StudentModuleCard, StudentWorkspaceShell } from "@/components/student/student-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireStudent } from "@/lib/auth/guards";
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

export default async function StudentHomePage() {
  const profile = await requireStudent();
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
    <StudentWorkspaceShell
      title="Student Dashboard"
      description="Your assignments, practice loop, mistakes, and self-study spaces live here."
      actions={
        <>
          <Button asChild>
            <Link href="/student/work">Open My Work</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/practice">Start Practice</Link>
          </Button>
        </>
      }
    >
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
          description="Classroom work assigned by a teacher, with Practice entry points."
          eyebrow="Assigned"
          href="/student/work"
          status={assignments.length ? `${assignments.length} active` : "Empty"}
          title="My Work"
        />
        <StudentModuleCard
          actionLabel="Start a round"
          description="Practice selected questions and save evidence back to assigned work."
          eyebrow="Practice"
          href="/practice"
          title="Practice"
        />
        <StudentModuleCard
          actionLabel="Review misses"
          description="Revisit missed questions and send them back into Practice."
          eyebrow="Recovery"
          href="/mistakes"
          title="Mistakes"
        />
        <StudentModuleCard
          actionLabel="See progress"
          description="Track completion, feedback, and next-step signals."
          eyebrow="Evidence"
          href="/student/progress"
          title="Progress / Feedback"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <StudentModuleCard
          actionLabel="Open study space"
          description="A student-owned library surface for saved questions and study sets."
          eyebrow="Self-study"
          href="/student/library"
          status="Shell"
          title="Study Library"
        />
        <StudentModuleCard
          actionLabel="Open groups"
          description="Peer study groups are a separate self-study space, not classrooms."
          eyebrow="Collaboration"
          href="/student/groups"
          status="Shell"
          title="Study Groups"
        />
        <StudentModuleCard
          actionLabel="Browse public questions"
          description="Use public/verified material without exposing teacher private Libraries."
          eyebrow="Discovery"
          href="/student/public-library"
          title="Public Library"
        />
      </section>

      <section className="student-soft-panel p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="student-eyebrow">Classroom delivery</p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">Classes are for assigned work.</h2>
            <p className="student-muted mt-2 max-w-3xl">
              Joining a classroom lets a teacher deliver assignments to My Work. It does not open the teacher&apos;s private source library.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/student/classrooms">My classes</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/student/classrooms/join">Join a class</Link>
            </Button>
          </div>
        </div>
      </section>
    </StudentWorkspaceShell>
  );
}
