"use client";

import {
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  FolderOpen,
  Send,
  Settings,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";

import { TeacherPendingLink } from "@/components/teacher/teacher-pending-link";

export type BankContextNavItem = {
  href: string;
  icon:
    | "blueprints"
    | "import"
    | "members"
    | "public-submissions"
    | "questions"
    | "review"
    | "settings"
    | "sources";
  label: string;
};

type BankContextNavProps = {
  primaryItems: BankContextNavItem[];
  secondaryItems: BankContextNavItem[];
};

function BankContextNavLink({
  href,
  icon,
  label,
}: BankContextNavItem) {
  const pathname = usePathname() ?? "";
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const Icon = {
    blueprints: Sparkles,
    import: Upload,
    members: Users,
    "public-submissions": Send,
    questions: BookOpen,
    review: ClipboardCheck,
    settings: Settings,
    sources: FolderOpen,
  }[icon];

  return (
    <TeacherPendingLink
      aria-current={active ? "page" : undefined}
      className={[
        "teacher-focus-ring flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors duration-200",
        active
          ? "bg-sky-100 text-sky-950"
          : "text-slate-600 hover:bg-sky-50 hover:text-sky-900",
      ].join(" ")}
      href={href}
      pendingLabel={`${label} Library page`}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </TeacherPendingLink>
  );
}

function BankContextNavItems({
  primaryItems,
  secondaryItems,
}: BankContextNavProps) {
  return (
    <div className="space-y-5">
      <nav aria-label="Library workflow" className="space-y-1">
        {primaryItems.map((item) => (
          <BankContextNavLink {...item} key={item.href} />
        ))}
      </nav>
      <nav
        aria-label="Library tools"
        className="space-y-1 border-t border-slate-200 pt-4"
      >
        {secondaryItems.map((item) => (
          <BankContextNavLink {...item} key={item.href} />
        ))}
      </nav>
    </div>
  );
}

export function BankContextNav(props: BankContextNavProps) {
  return (
    <div className="bank-context-nav">
      <aside
        aria-label="Library menu"
        className="sticky top-24 hidden rounded-lg border border-slate-200 bg-white p-3 lg:block"
      >
        <BankContextNavItems {...props} />
      </aside>

      <details className="group rounded-lg border border-slate-200 bg-white lg:hidden">
        <summary className="teacher-focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-slate-900">
          Library menu
          <ChevronDown
            aria-hidden="true"
            className="collapsible-chevron h-4 w-4 text-slate-500"
          />
        </summary>
        <div className="border-t border-slate-200 p-3">
          <BankContextNavItems {...props} />
        </div>
      </details>
    </div>
  );
}
