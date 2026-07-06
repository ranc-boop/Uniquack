import Link from "next/link";

import { TeacherModuleCard, TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import {
  listTeacherQuestionBanks,
  QuestionBankSchemaMissingError,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function buildTeacherModules({
  bankCount,
  setupNeeded,
}: {
  bankCount: number;
  setupNeeded: boolean;
}) {
  return [
    {
      title: "Dashboard",
      description:
        "See the teacher workspace entry point and the current bank-first workflow order.",
      href: "/teacher",
      eyebrow: "Workspace",
      status: "Home",
    },
    {
      title: "Question Bank",
      description:
        "Create, join, share, and organize private or collaborative question banks before delivery.",
      href: "/teacher/banks",
      eyebrow: "Content source",
      status: setupNeeded ? "Setup needed" : `${bankCount} banks`,
    },
    {
      title: "AI Parsing",
      description:
        "Import owned materials into Review Drafts, then approve questions into the selected bank.",
      href: "/teacher/ai-parsing",
      eyebrow: "Review gated",
      status: "Teacher import",
    },
    {
      title: "Blueprint",
      description:
        "Review reusable question patterns extracted from source material before generation is used.",
      href: "/teacher/blueprints",
      eyebrow: "Planning layer",
      status: "Library",
    },
    {
      title: "Classroom",
      description:
        "Manage rosters and delivery spaces after bank content is reviewed and ready to assign.",
      href: "/teacher/classrooms",
      eyebrow: "Roster layer",
      status: "Delivery",
    },
    {
      title: "Publish",
      description:
        "Move reviewed bank content into classroom assignments without publishing private content globally.",
      href: "/teacher/publish",
      eyebrow: "Assignment flow",
      status: "Private by default",
    },
    {
      title: "Progress",
      description:
        "Review assignment and practice evidence after students complete teacher-delivered work.",
      href: "/teacher/progress",
      eyebrow: "Evidence",
      status: "Insight",
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

  const teacherModules = buildTeacherModules({ bankCount, setupNeeded });

  return (
    <TeacherWorkspaceShell
      title="Teacher Workspace"
      description="Start with a Question Bank, review imported content, then deliver selected questions through classrooms and assignments."
      actions={
        <>
          <Button asChild>
            <Link href="/teacher/banks">Open Question Bank</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/teacher/ai-parsing">Import materials</Link>
          </Button>
        </>
      }
    >
      <TeacherWorkspaceNav />

      <section className="teacher-soft-panel p-5">
        <h2 className="text-base font-bold text-sky-950">Bank-first teacher workflow</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-sky-900">
          Teachers create or join banks, import and review questions, then deliver selected bank content
          through classrooms and assignments. Student visibility stays assignment-only unless content is
          intentionally published elsewhere.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {teacherModules.map((module) => (
          <TeacherModuleCard
            actionLabel={module.href === "/teacher" ? "View workflow" : "Open module"}
            description={module.description}
            eyebrow={module.eyebrow}
            href={module.href}
            key={module.title}
            status={module.status}
            title={module.title}
          />
        ))}
      </section>

      <section className="teacher-panel p-5">
        <h2 className="text-lg font-bold text-slate-950">Role boundary</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {profile.username || profile.email || "Teacher"} is using the teacher workspace. Admins may
          support this flow, but teacher validation remains separate from admin platform operations.
        </p>
      </section>
    </TeacherWorkspaceShell>
  );
}
