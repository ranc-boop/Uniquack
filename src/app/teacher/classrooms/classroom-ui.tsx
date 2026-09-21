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

import { TeacherPendingLink } from "@/components/teacher/teacher-pending-link";
import { buttonVariants } from "@/components/ui/button";
import { formatDate, formatDateTime, formatNumber, type Locale } from "@/lib/i18n/locale";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type ClassroomBadgeTone = "amber" | "blue" | "cyan" | "slate" | "sky";

const badgeClassByTone: Record<ClassroomBadgeTone, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  cyan: "border-cyan-200 bg-cyan-50 text-cyan-800",
  sky: "border-sky-200 bg-sky-50 text-sky-800",
  slate: "border-slate-200 bg-white text-slate-700",
};

const classroomTabs = [
  { href: "", icon: BookOpenCheck, labelKey: "classroom.overview" },
  { href: "/assignments", icon: ClipboardCheck, labelKey: "classroom.assignments" },
  { href: "/students", icon: Users, labelKey: "classroom.students" },
  { href: "/teachers", icon: Users, labelKey: "classroom.teachers" },
  { href: "/analytics", icon: BarChart3, labelKey: "classroom.progress" },
  { href: "/blueprints", icon: Sparkles, labelKey: "classroom.blueprints" },
  { href: "/settings", icon: Settings, labelKey: "classroom.settings" },
] as const;

export function formatClassroomDate(value: string | null | undefined, locale: Locale = "en") {
  if (!value) return "Not set";
  return formatDate(locale, value, { dateStyle: "medium" });
}

export function formatClassroomDateTime(value: string | null | undefined, locale: Locale = "en") {
  if (!value) return "No activity yet";
  return formatDateTime(locale, value, { dateStyle: "medium", timeStyle: "short" });
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

export async function ClassroomRouteTabs({ classroomId }: { classroomId: string }) {
  const locale = await getRequestLocale();
  const t = (key: MessageKey) => translate(locale, key);

  return (
    <nav
      aria-label={t("classroom.sections")}
      className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white/85 p-2 shadow-sm"
    >
      {classroomTabs.map(({ href, icon: Icon, labelKey }) => (
        <TeacherPendingLink
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          href={`/teacher/classrooms/${classroomId}${href}`}
          key={labelKey}
          pendingLabel={`${t(labelKey)} ${t("classroom.page")}`}
        >
          <Icon aria-hidden="true" className="h-4 w-4" />
          {t(labelKey)}
        </TeacherPendingLink>
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

export async function ClassroomProgressRing({
  helper,
  label,
  value,
}: {
  helper?: string;
  label: string;
  value: number | null;
}) {
  const locale = await getRequestLocale();
  const t = (key: MessageKey) => translate(locale, key);
  const bounded = value === null ? 0 : Math.max(0, Math.min(100, value));
  const formattedPercent = `${formatNumber(locale, bounded)}%`;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white/90 p-4">
      <div
        aria-label={`${label}: ${value === null ? t("classroom.notEnoughData") : formattedPercent}`}
        className="grid h-24 w-24 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(rgb(2 132 199) ${
            bounded * 3.6
          }deg, rgb(226 232 240) 0deg)`,
        }}
      >
        <div className="grid h-16 w-16 place-items-center rounded-full bg-white text-center">
          <span className="text-lg font-bold text-slate-950">
            {value === null ? t("classroom.noData") : formattedPercent}
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

export async function ClassroomPublishCta({
  classroomId,
  label,
}: {
  classroomId?: string;
  label?: string;
}) {
  const locale = await getRequestLocale();
  const displayLabel = label ?? translate(locale, "classroom.publishToClasses");
  const href = classroomId
    ? `/teacher/publish?classroomId=${encodeURIComponent(classroomId)}`
    : "/teacher/publish";

  return (
    <TeacherPendingLink
      className={cn(buttonVariants(), "inline-flex items-center gap-2")}
      href={href}
      pendingLabel={displayLabel}
    >
      <Megaphone aria-hidden="true" className="h-4 w-4" />
      {displayLabel}
    </TeacherPendingLink>
  );
}

export async function ClassroomQuickAction({
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
  const locale = await getRequestLocale();
  return (
    <TeacherPendingLink
      className={cn(buttonVariants({ variant }), "inline-flex items-center gap-2")}
      href={href}
      pendingLabel={typeof children === "string" ? children : translate(locale, "classroom.page")}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      {children}
    </TeacherPendingLink>
  );
}
