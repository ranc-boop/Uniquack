import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import type { LucideProps } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpenCheck,
  ClipboardCheck,
  Megaphone,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type ClassroomBadgeTone = "amber" | "blue" | "cyan" | "slate" | "sky";

const badgeClassByTone: Record<ClassroomBadgeTone, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
  sky: "border-sky-200 bg-sky-50 text-sky-800",
  slate: "border-slate-200 bg-white text-slate-700",
};

const classroomTabs = [
  { href: "", icon: BookOpenCheck, label: "Overview" },
  { href: "/assignments", icon: ClipboardCheck, label: "Assignments" },
  { href: "/students", icon: Users, label: "Students" },
  { href: "/teachers", icon: Users, label: "Teachers" },
  { href: "/analytics", icon: BarChart3, label: "Progress" },
  { href: "/blueprints", icon: Sparkles, label: "Blueprints" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function formatClassroomDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export function formatClassroomDateTime(value: string | null | undefined) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function classroomStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export function ClassroomBadge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: ClassroomBadgeTone;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${badgeClassByTone[tone]}`}
    >
      {children}
    </span>
  );
}

export function ClassroomRouteTabs({ classroomId }: { classroomId: string }) {
  return (
    <nav
      aria-label="Classroom sections"
      className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white/85 p-2 shadow-sm"
    >
      {classroomTabs.map(({ href, icon: Icon, label }) => (
        <Link
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          href={`/teacher/classrooms/${classroomId}${href}`}
          key={label}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function ClassroomMetricCard({
  description,
  icon: Icon,
  label,
  value,
}: {
  description?: string;
  icon?: ComponentType<LucideProps>;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/90 p-4 shadow-[0_14px_36px_-34px_rgba(15,23,42,0.65)] ring-1 ring-slate-950/5">
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

export function ClassroomProgressRing({
  helper,
  label,
  value,
}: {
  helper?: string;
  label: string;
  value: number | null;
}) {
  const bounded = value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white/90 p-4">
      <div
        aria-label={`${label}: ${value === null ? "not enough data" : `${bounded}%`}`}
        className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(rgb(2 132 199) ${
            bounded * 3.6
          }deg, rgb(226 232 240) 0deg)`,
        }}
      >
        <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-center">
          <span className="text-lg font-bold text-slate-950">
            {value === null ? "No data" : `${bounded}%`}
          </span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-base font-bold text-slate-950">{label}</p>
        {helper ? <p className="mt-1 text-sm leading-6 text-slate-600">{helper}</p> : null}
      </div>
    </div>
  );
}

export function ClassroomSectionHeader({
  action,
  description,
  eyebrow,
  title,
}: {
  action?: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="border-b border-slate-200 bg-white/70 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow ? <p className="teacher-eyebrow">{eyebrow}</p> : null}
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

export function ClassroomSafetyStrip() {
  const notes = [
    "Classes are roster and delivery spaces.",
    "Students receive selected assignment items only.",
    "Joining a class does not grant source bank access.",
  ];

  return (
    <section className="grid gap-2 md:grid-cols-3">
      {notes.map((note) => (
        <div
          className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-sm font-medium leading-6 text-sky-950"
          key={note}
        >
          {note}
        </div>
      ))}
    </section>
  );
}

export function ClassroomPublishCta({
  classroomId,
  label = "Publish to classes",
}: {
  classroomId?: string;
  label?: string;
}) {
  const href = classroomId
    ? `/teacher/publish?classroomId=${encodeURIComponent(classroomId)}`
    : "/teacher/publish";

  return (
    <Button asChild>
      <Link className="inline-flex items-center gap-2" href={href}>
        <Megaphone aria-hidden="true" className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}

export function ClassroomQuickAction({
  children,
  href,
  icon: Icon = Activity,
  variant = "outline",
}: {
  children: ReactNode;
  href: string;
  icon?: ComponentType<LucideProps>;
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
