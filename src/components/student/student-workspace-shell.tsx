import type { ReactNode } from "react";

import { StudentPendingLink } from "@/components/student/student-pending-link";

type StudentWorkspaceShellProps = {
  children?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

type StudentModuleCardProps = {
  title: string;
  description?: string;
  href: string;
  eyebrow?: string;
  status?: string;
  actionLabel?: string;
};

export function StudentWorkspaceShell({
  children,
  eyebrow,
  title,
  description,
  actions,
}: StudentWorkspaceShellProps) {
  return (
    <main className="space-y-6">
      <section className="student-hero flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl space-y-3">
          {eyebrow ? <p className="student-eyebrow">{eyebrow}</p> : null}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
              {title}
            </h1>
            {description ? <p className="student-muted text-base">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </section>
      {children}
    </main>
  );
}
export function StudentModuleCard({
  title,
  description,
  href,
  eyebrow,
  status,
  actionLabel = "Open",
}: StudentModuleCardProps) {
  return (
    <StudentPendingLink
      className="student-card-hover student-focus-ring student-panel flex h-full flex-col justify-between gap-5 p-5 text-left"
      href={href}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {eyebrow ? <span className="student-eyebrow">{eyebrow}</span> : null}
          {status ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {status}
            </span>
          ) : null}
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          {description ? <p className="student-muted">{description}</p> : null}
        </div>
      </div>
      <span className="text-sm font-semibold text-sky-700">{actionLabel}</span>
    </StudentPendingLink>
  );
}
