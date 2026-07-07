import Link from "next/link";

import { StudentWorkspaceShell } from "@/components/student/student-workspace-shell";
import { Button } from "@/components/ui/button";
import { requireStudent } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function StudentPublicLibraryPage() {
  await requireStudent();

  return (
    <StudentWorkspaceShell
      eyebrow="Discovery"
      title="Public Library"
      description="Browse public study material while private teacher banks stay private."
      actions={
        <Button asChild>
          <Link href="/questions">Browse public questions</Link>
        </Button>
      }
    >
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ["Public does not mean verified", "Verified content still needs a review signal."],
          ["Pull later, practice now", "Use the current public question bank for study rounds."],
          ["Private stays private", "Assignments do not expose the full teacher source bank."],
        ].map(([title, body]) => (
          <article className="student-panel p-5" key={title}>
            <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
            <p className="student-muted mt-2">{body}</p>
          </article>
        ))}
      </section>
    </StudentWorkspaceShell>
  );
}
