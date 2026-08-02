import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  TrendingUp,
} from "lucide-react";

import { TeacherPendingLink } from "@/components/teacher/teacher-pending-link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getTeacherHomeSummary } from "@/lib/teacher-dashboard";

export const dynamic = "force-dynamic";

export default async function TeacherHomePage() {
  const profile = await requireTeacher();
  const supabase = await createClient();
  const summary = await getTeacherHomeSummary({
    profileId: profile.id,
    supabase,
  });
  const actionCountLabel =
    summary.nextAction.count === null
      ? null
      : summary.nextAction.label === "Review"
        ? `${summary.nextAction.count} drafts`
        : `${summary.nextAction.count} ready questions`;
  const shortcuts = [
    {
      count: summary.libraryCount,
      href: "/teacher/banks",
      icon: BookOpen,
      label: "Libraries",
    },
    {
      count: null,
      href: "/teacher/publish",
      icon: ClipboardList,
      label: "Assignments",
    },
    {
      count: null,
      href: "/teacher/progress",
      icon: TrendingUp,
      label: "Progress",
    },
  ];

  return (
    <div className="teacher-shell min-h-dvh space-y-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">
          Teacher
        </h1>
      </header>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-8 px-6 py-8 md:px-8 md:py-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-500">Next action</h2>
            <p className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">
              {summary.nextAction.title}
            </p>
            {actionCountLabel ? (
              <p className="mt-2 text-base font-medium text-slate-600">
                {actionCountLabel}
              </p>
            ) : null}
          </div>
          <TeacherPendingLink
            className={cn(buttonVariants(), "min-h-11 shrink-0")}
            href={summary.nextAction.href}
            pendingLabel={summary.nextAction.label}
          >
            {summary.nextAction.label}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </TeacherPendingLink>
        </div>
      </section>

      <nav
        aria-label="Teacher shortcuts"
        className="grid overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-3 md:divide-x md:divide-slate-200"
      >
        {shortcuts.map(({ count, href, icon: Icon, label }) => (
          <TeacherPendingLink
            className="group flex min-h-24 items-center gap-4 border-b border-slate-200 px-6 py-5 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 md:border-b-0"
            href={href}
            key={href}
            pendingLabel={label}
          >
            <Icon aria-hidden="true" className="h-5 w-5 text-slate-500" />
            <span className="min-w-0 flex-1 text-base font-semibold text-slate-950">
              {label}
            </span>
            {count !== null ? (
              <span className="text-sm font-semibold tabular-nums text-slate-500">
                {count}
              </span>
            ) : null}
            <ArrowRight
              aria-hidden="true"
              className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5"
            />
          </TeacherPendingLink>
        ))}
      </nav>

      {summary.setupNeeded ? (
        <p className="text-sm font-medium text-rose-700" role="alert">
          Libraries are unavailable.
        </p>
      ) : null}
    </div>
  );
}
