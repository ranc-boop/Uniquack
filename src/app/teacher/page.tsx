import Link from "next/link";

import { TeacherModuleCard, TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import {
  TeacherDashboardActionBoard,
  TeacherDashboardEvidencePanel,
  TeacherDashboardOverviewCards,
  TeacherDashboardWorkflowPanel,
} from "@/components/teacher/teacher-dashboard-panels";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getTeacherDashboardSummary, type TeacherDashboardSummary } from "@/lib/teacher-dashboard";

export const dynamic = "force-dynamic";

const workflowTitle = "Library-first teacher workflow";
const workflowDescription =
  "Teachers create or join Libraries, import and review questions, then deliver selected Library content through classrooms and assignments. No unreviewed draft can be assigned to students. Student visibility stays assignment-only unless content is intentionally published elsewhere.";

function buildTeacherModules({
  summary,
  setupNeeded,
}: {
  summary: TeacherDashboardSummary;
  setupNeeded: boolean;
}) {
  return [
    {
      title: "Dashboard",
      description:
        "See Review Drafts, assignment-ready Library content, classroom activity, and Practice evidence in one place.",
      href: "/teacher",
      eyebrow: "Workspace",
      status: `${summary.overview.recentEvidenceCount} evidence links`,
    },
    {
      title: "Library",
      description:
        "Create, join, share, and organize private or collaborative Libraries before delivery.",
      href: "/teacher/banks",
      eyebrow: "Content source",
      status: setupNeeded ? "Setup needed" : `${summary.overview.totalBankCount} Libraries`,
    },
    {
      title: "AI Parsing",
      description:
        "Choose a Library first, then import owned materials into Review Drafts for approval.",
      href: "/teacher/banks?intent=import",
      eyebrow: "Review gated",
      status: `${summary.recentImports.length} recent imports`,
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
        "Manage rosters and delivery spaces after Library content is reviewed and ready to assign.",
      href: "/teacher/classrooms",
      eyebrow: "Roster layer",
      status: `${summary.overview.activeClassroomCount} active`,
    },
    {
      title: "Publish",
      description:
        "Move reviewed Library content into classroom assignments without publishing private content globally.",
      href: "/teacher/publish",
      eyebrow: "Assignment flow",
      status: `${summary.overview.assignmentReadyQuestionCount} ready`,
    },
    {
      title: "Progress & Feedback",
      description:
        "Review assignment evidence, then add private notes or send feedback from assignment detail.",
      href: "/teacher/progress",
      eyebrow: "Evidence",
      status: `${summary.overview.activeAssignmentCount} active assignments`,
    },
  ];
}

function buildPrimaryAction(summary: TeacherDashboardSummary) {
  const firstReviewBank = summary.reviewQueue[0];
  const firstReadyBank = summary.assignmentReadyBanks[0];

  if (firstReviewBank) {
    return {
      href: `/teacher/banks/${firstReviewBank.bankId}/review`,
      label: "Review Drafts",
    };
  }

  if (firstReadyBank) {
    return {
      href: `/teacher/publish?sourceBankId=${firstReadyBank.bankId}`,
      label: "Create Assignment",
    };
  }

  if (!summary.overview.totalBankCount) {
    return {
      href: "/teacher/banks/new",
      label: "Create Library",
    };
  }

  return {
    href: "/teacher/banks?intent=import",
    label: "Import materials",
  };
}

export default async function TeacherHomePage() {
  const profile = await requireTeacher();
  const supabase = await createClient();
  const dashboardSummary = await getTeacherDashboardSummary({
    profileId: profile.id,
    supabase,
  });
  const teacherModules = buildTeacherModules({
    setupNeeded: dashboardSummary.setupNeeded,
    summary: dashboardSummary,
  });
  const primaryAction = buildPrimaryAction(dashboardSummary);

  return (
    <TeacherWorkspaceShell
      title="Teacher Workspace"
      description="Start with a Library. Create or join one, review imported content, assign selected questions, then read student Practice evidence as it returns."
      actions={
        <>
          <Button asChild>
            <Link href={primaryAction.href}>{primaryAction.label}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/teacher/banks">Open Library review</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/teacher/banks?intent=import">Import materials</Link>
          </Button>
        </>
      }
    >
      <TeacherWorkspaceNav />

      {dashboardSummary.setupNeeded ? (
        <section className="teacher-panel p-5">
          <p className="teacher-eyebrow">Setup needed</p>
          <h2 className="mt-2 text-lg font-bold text-slate-950">
            Library dashboard data is waiting on the clean Library schema.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Apply the clean Library migrations, then return here to see Review Drafts,
            assignment-ready questions, classroom activity, and Practice evidence.
          </p>
        </section>
      ) : null}

      <TeacherDashboardOverviewCards summary={dashboardSummary} />

      <TeacherDashboardActionBoard summary={dashboardSummary} />

      <TeacherDashboardEvidencePanel summary={dashboardSummary} />

      <TeacherDashboardWorkflowPanel
        description={workflowDescription}
        title={workflowTitle}
      />

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
