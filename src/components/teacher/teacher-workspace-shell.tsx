import Link from "next/link";
import type { ReactNode } from "react";

type TeacherWorkspaceShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

type TeacherModuleCardProps = {
  title: string;
  description: string;
  href: string;
  eyebrow?: string;
  status?: string;
  actionLabel?: string;
};

export function TeacherWorkspaceShell({
  children,
  title,
  actions,
}: TeacherWorkspaceShellProps) {
  return (
    <div className="teacher-shell space-y-8">
      <header className="teacher-page-header">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
          {title}
        </h1>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
export function TeacherModuleCard({
  title,
  description,
  href,
  eyebrow,
  status,
  actionLabel = "Open",
}: TeacherModuleCardProps) {
  return (
    <Link
      href={href}
      className="teacher-card-hover teacher-panel flex h-full flex-col justify-between gap-5 p-5 text-left teacher-focus-ring"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {eyebrow ? <span className="teacher-eyebrow">{eyebrow}</span> : null}
          {status ? (
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
              {status}
            </span>
          ) : null}
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <p className="teacher-muted">{description}</p>
        </div>
      </div>
      <span className="text-sm font-semibold text-sky-700">{actionLabel}</span>
    </Link>
  );
}
