import Link from "next/link";
import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import {
  Archive,
  BookOpen,
  Boxes,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Settings,
  Share2,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";

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
    <main
      className={`student-shell min-h-dvh space-y-6 bg-gradient-to-br from-slate-50 via-sky-50/50 to-white ${className}`}
    >
      {children}
    </main>
  );
}

export function BankHeroPanel({
  actions,
  badges,
  children,
  eyebrow,
  title,
}: {
  actions?: React.ReactNode;
  badges?: React.ReactNode;
  children: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200/80 bg-white/85 p-5 shadow-[0_18px_48px_-40px_rgba(15,23,42,0.7)] ring-1 ring-slate-950/5 backdrop-blur">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="student-eyebrow">{eyebrow}</p>
            {badges}
          </div>
          <h1 className="text-balance text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
            {title}
          </h1>
          <div className="max-w-4xl text-base leading-7 text-slate-600">
            {children}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">{actions}</div>
        ) : null}
      </div>
    </section>
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
  title,
}: {
  action?: React.ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="border-b border-slate-200 bg-white/70 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow ? <p className="student-eyebrow">{eyebrow}</p> : null}
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
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

export function BankRouteTabs({ bankId }: { bankId: string }) {
  const tabs = [
    { href: `/teacher/banks/${bankId}/questions`, icon: BookOpen, label: "Questions" },
    { href: `/teacher/banks/${bankId}/imports`, icon: Upload, label: "Imports" },
    { href: `/teacher/banks/${bankId}/review`, icon: ClipboardCheck, label: "Review Drafts" },
    { href: `/teacher/banks/${bankId}/blueprints`, icon: Sparkles, label: "Blueprints" },
    { href: `/teacher/banks/${bankId}/members`, icon: Users, label: "Members" },
    { href: `/teacher/banks/${bankId}/sources`, icon: FolderOpen, label: "Sources" },
    { href: `/teacher/banks/${bankId}/settings`, icon: Settings, label: "Settings" },
  ];

  return (
    <nav
      aria-label="Question Bank sections"
      className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white/85 p-2 shadow-sm"
    >
      {tabs.map(({ href, icon: Icon, label }) => (
        <Link
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          href={href}
          key={href}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function BankSafetyList() {
  const notes = [
    "AI drafts stay private until reviewed.",
    "Assignments expose selected approved items, not the full bank.",
    "Public movement requires a separate review gate.",
  ];

  return (
    <div className="grid gap-2 md:grid-cols-3">
      {notes.map((note) => (
        <div
          className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-sm font-medium leading-6 text-sky-950"
          key={note}
        >
          {note}
        </div>
      ))}
    </div>
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
    <Button asChild variant={variant}>
      <Link className="inline-flex items-center gap-2" href={href}>
        <Icon aria-hidden="true" className="h-4 w-4" />
        {children}
      </Link>
    </Button>
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
  settings: Settings,
  sources: FolderOpen,
};
