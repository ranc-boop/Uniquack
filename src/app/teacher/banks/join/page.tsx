import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function JoinTeacherBankPage() {
  await requireTeacher();

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="student-eyebrow">Join Bank by Share Code</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Bank collaboration is teacher-to-teacher.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Share-code mutation is intentionally deferred. Students join
              classrooms; teachers join banks.
            </p>
          </div>
          <TeacherWorkspaceNav />
        </div>
      </section>

      <section className="student-panel p-6">
        <h2 className="text-lg font-bold text-slate-950">
          Coming next: safe bank join codes
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          The next bank foundation slices will add hashed share codes, member
          roles, revoke/rotate behavior, and RLS checks. No join form is active
          in this reconciliation PR.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/teacher/banks">Back to Banks / Library</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/teacher">Teacher Studio</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

