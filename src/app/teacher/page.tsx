import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";
import {
  listTeacherQuestionBanks,
  QuestionBankSchemaMissingError,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function buildStudioCards({
  bankCount,
  setupNeeded,
}: {
  bankCount: number;
  setupNeeded: boolean;
}) {
  return [
  {
    title: "My Question Banks / Library",
    description:
      "The bank is the teacher-owned content workspace. Questions should be reviewed here before they become assignments.",
    href: "/teacher/banks",
    cta: "Open Banks / Library",
    status: setupNeeded ? "Setup needed" : `${bankCount} banks`,
  },
  {
    title: "Create Question Bank",
    description:
      "Start a private or shared bank before building class delivery.",
    href: "/teacher/banks/new",
    cta: "Create a bank",
    status: "Teacher-owned",
  },
  {
    title: "Join Bank by Share Code",
    description:
      "Teacher collaboration belongs at the bank layer. Share-code mutations arrive with the Bank Foundation PR.",
    href: "/teacher/banks/join",
    cta: "View join flow",
    status: "Coming next",
  },
  {
    title: "Recent Imports",
    description:
      "Choose a bank first, then import private material into bank-scoped Review Drafts.",
    href: "/teacher/banks",
    cta: "Choose a bank to import",
    status: "Review-gated",
  },
  {
    title: "Review Drafts",
    description:
      "Review happens inside the target bank. No unreviewed draft can be assigned to students.",
    href: "/teacher/banks",
    cta: "Open bank review",
    status: "Safety gate",
  },
  {
    title: "Classrooms",
    description:
      "Classes are delivery spaces. Build or choose bank content before assigning it to a roster.",
    href: "/teacher/classrooms",
    cta: "Open classrooms",
    status: "Delivery layer",
  },
  {
    title: "Assignments",
    description:
      "Assignments are delivery events. The next architecture slice will source them from teacher banks.",
    href: "/teacher/classrooms",
    cta: "Choose a class",
    status: "Delivery event",
  },
  {
    title: "Course Builder",
    description:
      "Course Builder should generate bank packages before assignment. The current bridge remains direct-access only.",
    href: "/teacher/course-builder",
    cta: "Open bridge",
    status: "Rebuild planned",
  },
];
}

export default async function TeacherHomePage() {
  const profile = await requireTeacher();
  const supabase = await createClient();
  let bankCount = 0;
  let setupNeeded = false;

  try {
    const banks = await listTeacherQuestionBanks({
      profileId: profile.id,
      supabase,
    });
    bankCount = banks.length;
  } catch (error) {
    if (error instanceof QuestionBankSchemaMissingError) {
      setupNeeded = true;
    } else {
      throw error;
    }
  }

  const studioCards = buildStudioCards({ bankCount, setupNeeded });

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="student-eyebrow">Teacher Studio</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Start with your Question Bank / Library.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Start by creating or joining a Question Bank. Classrooms and
              assignments deliver selected bank content.
            </p>
          </div>
          <TeacherWorkspaceNav />
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/teacher/banks">Open Banks / Library</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/teacher/banks">Open bank review</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/teacher/classrooms">Delivery classrooms</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-sky-200 bg-sky-50 p-5">
        <h2 className="text-base font-bold text-sky-950">
          Bank-first teacher workflow
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-sky-900">
          This hub starts with teacher-owned banks. Review Draft approval,
          imports, and assignment delivery stay separated so unreviewed content
          cannot be assigned to students.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {studioCards.map((card) => (
          <article
            className="student-panel flex min-h-56 flex-col justify-between p-5"
            key={card.title}
          >
            <div className="space-y-3">
              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {card.status}
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {card.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {card.description}
                </p>
              </div>
            </div>
            <Button asChild className="mt-5 w-full" variant="outline">
              <Link href={card.href}>{card.cta}</Link>
            </Button>
          </article>
        ))}
      </section>

      <section className="student-panel p-5">
        <h2 className="text-lg font-bold text-slate-950">
          Signed in as teacher workspace user
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {profile.username || profile.email || "Teacher"} can use this studio
          to move from reviewed bank content into delivery. Admin access to this
          page is a workspace preview, not a replacement for teacher validation.
        </p>
      </section>
    </main>
  );
}
