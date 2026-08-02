import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  Archive,
  BookOpen,
  Boxes,
  ClipboardCheck,
  FolderOpen,
  Share2,
  Upload,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { TeacherPendingLink } from "@/components/teacher/teacher-pending-link";
import { cn } from "@/lib/utils";
import {
  BankContextNav,
  type BankContextNavItem,
} from "@/components/teacher/bank-context-nav";

type BadgeTone =
  | "amber"
  | "blue"
  | "cyan"
  | "indigo"
  | "rose"
  | "slate"
  | "sky";

type BankBadgeProps = {
  children: React.ReactNode;
  tone?: BadgeTone;
};

const badgeToneClass: Record<BadgeTone, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-800",
  rose: "border-rose-200 bg-rose-50 text-rose-800",
  slate: "border-slate-200 bg-white text-slate-700",
  sky: "border-sky-200 bg-sky-50 text-sky-800",
};

export function BankBadge({ children, tone = "slate" }: BankBadgeProps) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeToneClass[tone]}`}
    >
      {children}
    </span>
  );
}

export function BankWorkbenchPage({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bank-workbench teacher-shell min-h-dvh ${className}`}
    >
      {children}
    </div>
  );
}

export function BankHeroPanel({
  actions,
  title,
}: {
  actions?: React.ReactNode;
  badges?: React.ReactNode;
  children: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="teacher-page-header">
      <h1 className="text-balance text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
        {title}
      </h1>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

export function BankMetricCard({
  description,
  icon: Icon,
  label,
  value,
}: {
  description?: string;
  icon?: ComponentType<LucideProps>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/85 p-4 shadow-[0_14px_36px_-34px_rgba(15,23,42,0.65)] ring-1 ring-slate-950/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </p>
          <p className="mt-2 break-words text-2xl font-bold text-slate-950">
            {value}
          </p>
        </div>
        {Icon ? (
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
        ) : null}
      </div>
      {description ? (
        <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
      ) : null}
    </div>
  );
}

export function BankSectionHeader({
  action,
  description,
  eyebrow,
  focusId,
  title,
}: {
  action?: React.ReactNode;
  description?: string;
  eyebrow?: string;
  focusId?: string;
  title: string;
}) {
  return (
    <div className="border-b border-slate-200 bg-white/70 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow ? <p className="student-eyebrow">{eyebrow}</p> : null}
          <h2
            className="text-xl font-bold text-slate-950"
            id={focusId}
            tabIndex={focusId ? -1 : undefined}
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function BankRouteTabs({
  bankId,
  currentUserRole,
}: {
  bankId: string;
  currentUserRole: "editor" | "owner" | "viewer" | null;
}) {
  const primaryTabs: BankContextNavItem[] = [
    { href: `/teacher/banks/${bankId}/questions`, icon: "questions", label: "Questions" },
    { href: `/teacher/banks/${bankId}/review`, icon: "review", label: "Review" },
    ...(currentUserRole === "owner" || currentUserRole === "editor"
      ? [{ href: `/teacher/banks/${bankId}/imports`, icon: "import" as const, label: "Import" }]
      : []),
  ];
  const secondaryTabs: BankContextNavItem[] = [
    { href: `/teacher/banks/${bankId}/submissions`, icon: "public-submissions", label: "Public Submissions" },
    { href: `/teacher/banks/${bankId}/blueprints`, icon: "blueprints", label: "Blueprints" },
    { href: `/teacher/banks/${bankId}/members`, icon: "members", label: "Members" },
    { href: `/teacher/banks/${bankId}/sources`, icon: "sources", label: "Sources" },
  ];

  return (
    <BankContextNav
      primaryItems={primaryTabs}
      secondaryItems={secondaryTabs}
    />
  );
}

export function BankQuickAction({
  children,
  href,
  icon: Icon,
  variant = "outline",
}: {
  children: React.ReactNode;
  href: string;
  icon: ComponentType<LucideProps>;
  variant?: "default" | "outline";
}) {
  return (
    <TeacherPendingLink
      className={cn(buttonVariants({ variant }), "inline-flex items-center gap-2")}
      href={href}
      pendingLabel={typeof children === "string" ? children : "Library page"}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      {children}
    </TeacherPendingLink>
  );
}

export const bankActionIcons = {
  archive: Archive,
  assignment: ClipboardCheck,
  bank: Boxes,
  import: Upload,
  members: Share2,
  questions: BookOpen,
  review: ClipboardCheck,
  sources: FolderOpen,
};
