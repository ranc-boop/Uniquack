import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type {
  TeacherDashboardAssignmentAttention,
  TeacherDashboardSummary,
} from "@/lib/teacher-dashboard";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No activity yet";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatPercent(value: number | null) {
  return value === null ? "No submissions yet" : `${value}% complete`;
}

function attentionLabel(reason: TeacherDashboardAssignmentAttention["reason"]) {
  if (reason === "overdue") return "Overdue";
  if (reason === "due_soon") return "Due soon";
  return "Low completion";
}

function EmptyState({
  actionHref,
  actionLabel,
  children,
}: {
  actionHref?: string;
  actionLabel?: string;
  children: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4">
      <p className="text-sm leading-6 text-slate-600">{children}</p>
      {actionHref && actionLabel ? (
        <Button asChild className="mt-3" size="sm" variant="outline">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function DashboardSection({
  action,
  children,
  description,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="teacher-panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="space-y-3 p-5">{children}</div>
    </section>
  );
}

export function TeacherDashboardOverviewCards({
  summary,
}: {
  summary: TeacherDashboardSummary;
}) {
  const cards = [
    {
      label: "Question Banks",
      value: summary.overview.totalBankCount,
      detail: "private/shared libraries",
    },
    {
      label: "Review Drafts",
      value: summary.overview.reviewDraftCount,
      detail: "waiting for teacher approval",
    },
    {
      label: "Assignment-ready",
      value: summary.overview.assignmentReadyQuestionCount,
      detail: "reviewed bank questions",
    },
    {
      label: "Active classrooms",
      value: summary.overview.activeClassroomCount,
      detail: `${formatNumber(summary.overview.activeStudentCount)} students`,
    },
    {
      label: "Active assignments",
      value: summary.overview.activeAssignmentCount,
      detail: `${formatNumber(summary.overview.draftAssignmentCount)} drafts saved`,
    },
    {
      label: "Recent evidence",
      value: summary.overview.recentEvidenceCount,
      detail: `${formatNumber(summary.overview.studentsWithActiveProgressCount)} students in progress`,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {cards.map((card) => (
        <article className="teacher-panel p-4" key={card.label}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {card.label}
          </p>
          <p className="mt-3 text-3xl font-bold text-slate-950">{formatNumber(card.value)}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{card.detail}</p>
        </article>
      ))}
    </section>
  );
}

export function TeacherDashboardActionBoard({
  summary,
}: {
  summary: TeacherDashboardSummary;
}) {
  const firstReviewBank = summary.reviewQueue[0];
  const firstReadyBank = summary.assignmentReadyBanks[0];

  return (
    <section className="grid gap-5 xl:grid-cols-2">
      <DashboardSection
        action={
          firstReviewBank ? (
            <Button asChild size="sm">
              <Link href={`/teacher/banks/${firstReviewBank.bankId}/review`}>Open bank review</Link>
            </Button>
          ) : null
        }
        description="Approve teacher-owned Review Drafts before anything can reach assignments."
        title="Review Drafts"
      >
        {summary.reviewQueue.length ? (
          summary.reviewQueue.map((item) => (
            <Link
              className="block rounded-lg border border-amber-200 bg-amber-50/60 p-4 transition hover:border-amber-300 hover:bg-amber-50"
              href={`/teacher/banks/${item.bankId}/review`}
              key={item.bankId}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{item.bankName}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatNumber(item.reviewDraftCount)} drafts pending review
                    {item.warningCount ? `, ${formatNumber(item.warningCount)} warnings` : ""}
                  </p>
                </div>
                <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800">
                  Latest {formatDate(item.latestDraftAt)}
                </span>
              </div>
            </Link>
          ))
        ) : (
          <EmptyState actionHref="/teacher/ai-parsing" actionLabel="Import materials">
            No Review Drafts are waiting. Import owned materials into a bank when you are ready.
          </EmptyState>
        )}
      </DashboardSection>

      <DashboardSection
        action={
          firstReadyBank ? (
            <Button asChild size="sm">
              <Link href={`/teacher/publish?sourceBankId=${firstReadyBank.bankId}`}>
                Publish from Library
              </Link>
            </Button>
          ) : null
        }
        description="Reviewed bank questions that can become assignment-only student work."
        title="Assignment-ready"
      >
        {summary.assignmentReadyBanks.length ? (
          summary.assignmentReadyBanks.map((bank) => (
            <Link
              className="block rounded-lg border border-sky-200 bg-sky-50/50 p-4 transition hover:border-sky-300 hover:bg-sky-50"
              href={`/teacher/publish?sourceBankId=${bank.bankId}`}
              key={bank.bankId}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{bank.bankName}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatNumber(bank.assignmentReadyCount)} reviewed questions ready to assign.
                  </p>
                </div>
                <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-800">
                  {bank.visibility} bank
                </span>
              </div>
            </Link>
          ))
        ) : (
          <EmptyState actionHref="/teacher/banks" actionLabel="Open Question Bank">
            No reviewed bank questions are assignment-ready yet. Review imported drafts first.
          </EmptyState>
        )}
      </DashboardSection>

      <DashboardSection
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/teacher/classrooms">Open Classrooms</Link>
          </Button>
        }
        description="Roster and delivery spaces fed by approved bank content."
        title="Classroom activity"
      >
        {summary.classroomActivity.length ? (
          summary.classroomActivity.map((classroom) => (
            <Link
              className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-sky-200 hover:bg-sky-50/40"
              href={`/teacher/classrooms/${classroom.classroomId}`}
              key={classroom.classroomId}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{classroom.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatNumber(classroom.studentCount)} students,{" "}
                    {formatNumber(classroom.activeAssignmentCount)} active assignments.
                  </p>
                  {classroom.latestAssignmentTitle ? (
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Latest: {classroom.latestAssignmentTitle}
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {formatPercent(classroom.completionRate)}
                </span>
              </div>
            </Link>
          ))
        ) : (
          <EmptyState actionHref="/teacher/classrooms" actionLabel="Create Class">
            No classes yet. Create a class after your bank has reviewed content to deliver.
          </EmptyState>
        )}
      </DashboardSection>

      <DashboardSection
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/teacher/progress">Open Progress</Link>
          </Button>
        }
        description="Assignments with due dates, incomplete work, or low completion."
        title="Needs attention"
      >
        {summary.assignmentsNeedingAttention.length ? (
          summary.assignmentsNeedingAttention.map((assignment) => (
            <Link
              className="block rounded-lg border border-rose-200 bg-rose-50/50 p-4 transition hover:border-rose-300 hover:bg-rose-50"
              href={`/teacher/classrooms/${assignment.classroomId}/assignments/${assignment.assignmentId}`}
              key={assignment.assignmentId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{assignment.title}</h3>
                  <p className="mt-1 text-sm text-slate-600">{assignment.classroomName}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {formatNumber(assignment.completedCount)} completed,{" "}
                    {formatNumber(assignment.inProgressCount)} in progress,{" "}
                    {formatNumber(assignment.notStartedCount)} not started.
                  </p>
                </div>
                <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-800">
                  {attentionLabel(assignment.reason)}
                </span>
              </div>
            </Link>
          ))
        ) : (
          <EmptyState>
            No assignment attention items yet. Due-date and completion signals appear after assigned work starts.
          </EmptyState>
        )}
      </DashboardSection>
    </section>
  );
}

export function TeacherDashboardEvidencePanel({
  summary,
}: {
  summary: TeacherDashboardSummary;
}) {
  return (
    <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <DashboardSection
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/teacher/progress">Open Progress</Link>
          </Button>
        }
        description="Assignment-linked Practice sessions only. Student self-study is not mixed in."
        title="Recent Practice evidence"
      >
        {summary.recentEvidence.length ? (
          summary.recentEvidence.map((evidence) => (
            <Link
              className="block rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 transition hover:border-emerald-300 hover:bg-emerald-50"
              href={`/teacher/classrooms/${evidence.classroomId}/assignments/${evidence.assignmentId}`}
              key={evidence.practiceSessionId}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">{evidence.studentName}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {evidence.assignmentTitle} · {evidence.classroomName}
                  </p>
                </div>
                <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  {formatNumber(evidence.correctCount)}/{formatNumber(evidence.attemptCount)} correct
                </span>
              </div>
            </Link>
          ))
        ) : (
          <EmptyState actionHref="/teacher/publish" actionLabel="Publish assignment">
            No assignment Practice evidence yet. Evidence arrives after students start assigned work.
          </EmptyState>
        )}
      </DashboardSection>

      <DashboardSection
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/teacher/ai-parsing">Open AI Parsing</Link>
          </Button>
        }
        description="Recent bank-targeted imports, with draft counts when the import summary provides them."
        title="Recent imports"
      >
        {summary.recentImports.length ? (
          summary.recentImports.map((item) => (
            <Link
              className="block rounded-lg border border-slate-200 bg-white p-4 transition hover:border-sky-200 hover:bg-sky-50/40"
              href={item.bankId ? `/teacher/banks/${item.bankId}/imports` : "/teacher/ai-parsing"}
              key={item.id}
            >
              <h3 className="font-semibold text-slate-950">{item.bankName ?? "Bank import"}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {item.sourceType} · {item.status}
                {item.draftCount !== null ? ` · ${formatNumber(item.draftCount)} drafts` : ""}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">{formatDate(item.createdAt)}</p>
            </Link>
          ))
        ) : (
          <EmptyState actionHref="/teacher/ai-parsing" actionLabel="Import materials">
            No imports yet. Pick a bank first, then send owned materials to Review Drafts.
          </EmptyState>
        )}
      </DashboardSection>
    </section>
  );
}

export function TeacherDashboardWorkflowPanel({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  const steps = [
    {
      href: "/teacher/banks",
      label: "1. Build the bank",
      text: "Create or join a Question Bank and keep content private by default.",
    },
    {
      href: "/teacher/ai-parsing",
      label: "2. Review imports",
      text: "AI Parsing creates Review Drafts. No unreviewed draft can be assigned to students.",
    },
    {
      href: "/teacher/publish",
      label: "3. Publish assignments",
      text: "Publish selected reviewed bank questions to classes as assignment-only work.",
    },
    {
      href: "/teacher/progress",
      label: "4. Read evidence",
      text: "Practice evidence returns to the teacher dashboard and assignment detail views.",
    },
  ];

  return (
    <section className="teacher-soft-panel p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-sky-950">{title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-sky-900">
            {description}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/teacher/banks">Open Question Bank</Link>
        </Button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-4">
        {steps.map((step) => (
          <Link
            className="rounded-lg border border-sky-200 bg-white/80 p-4 text-sm transition hover:border-sky-300 hover:bg-white"
            href={step.href}
            key={step.label}
          >
            <h3 className="font-bold text-sky-950">{step.label}</h3>
            <p className="mt-2 leading-6 text-sky-900">{step.text}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
