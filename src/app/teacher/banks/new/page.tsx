import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function NewTeacherBankPage() {
  await requireTeacher();

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="student-eyebrow">Create Question Bank</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Plan a bank before assigning work.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              The real create flow arrives with Question Bank / Library
              Foundation. This placeholder intentionally does not write data.
            </p>
          </div>
          <TeacherWorkspaceNav />
        </div>
      </section>

      <section className="student-panel p-6">
        <h2 className="text-lg font-bold text-slate-950">
          Coming next: bank creation
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {["Name and visibility", "Members and roles", "Import destination"].map(
            (item) => (
              <div
                className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700"
                key={item}
              >
                {item}
              </div>
            ),
          )}
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          A teacher bank will be private by default. Shared, organization, and
          public workflows require explicit roles and review gates.
        </p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/teacher/banks">Back to Banks / Library</Link>
        </Button>
      </section>
    </main>
  );
}

