import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

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
  eyebrow = "Teacher workspace",
  title,
  description,
  actions,
}: TeacherWorkspaceShellProps) {
  return (
    <div className="teacher-shell space-y-6">
      <section className="teacher-hero flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl space-y-3">
          <p className="teacher-eyebrow">{eyebrow}</p>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">{title}</h1>
            {description ? <p className="teacher-muted text-base">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </section>
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

export function TeacherComingSoonPanel({
  title,
  description,
  href,
  hrefLabel,
}: {
  title: string;
  description: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <section className="teacher-panel space-y-3 p-5">
      <p className="teacher-eyebrow">Module shell</p>
      <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
      <p className="teacher-muted max-w-3xl">{description}</p>
      {href && hrefLabel ? (
        <Button asChild>
          <Link href={href}>{hrefLabel}</Link>
        </Button>
      ) : null}
    </section>
  );
}
