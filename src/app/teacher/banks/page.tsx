import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function TeacherBanksPage() {
  await requireTeacher();

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="student-eyebrow">Banks / Library</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Teacher-owned content starts here.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Question Bank / Library Foundation is the next implementation PR.
              This page is a stable placeholder so the teacher workflow no
              longer starts at classrooms.
            </p>
          </div>
          <TeacherWorkspaceNav />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="student-panel p-5">
          <h2 className="text-lg font-bold text-slate-950">Private banks</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Teacher-owned imports and approved questions should land in private
            banks by default.
          </p>
        </article>
        <article className="student-panel p-5">
          <h2 className="text-lg font-bold text-slate-950">Shared banks</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Collaborative banks will use members and roles before content is
            assigned to a class.
          </p>
        </article>
        <article className="student-panel p-5">
          <h2 className="text-lg font-bold text-slate-950">Public pull</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Public questions should be pulled into a teacher bank before local
            assignment.
          </p>
        </article>
      </section>

      <section className="student-panel p-6 text-center">
        <h2 className="text-lg font-bold text-slate-950">
          Bank data model is not implemented in this PR.
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          No fake banks are shown and no mutation forms are active. The next PR
          will add the real Question Bank / Library Foundation.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/teacher/banks/new">Plan a new bank</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/teacher/banks/join">View join flow</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

