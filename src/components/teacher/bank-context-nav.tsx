"use client";

import {
  BookOpen,
  ChevronDown,
  ClipboardCheck,
  FolderOpen,
  Send,
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
    | "sources";
  label: string;
};

type BankContextNavProps = {
  primaryItems: BankContextNavItem[];
  secondaryItems: BankContextNavItem[];
};

function isActivePath(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BankContextNavLink({
  active,
  href,
  icon,
  label,
  presentation = "bar",
}: BankContextNavItem & {
  active: boolean;
  presentation?: "bar" | "menu";
}) {
  const Icon = {
    blueprints: Sparkles,
    import: Upload,
    members: Users,
    "public-submissions": Send,
    questions: BookOpen,
    review: ClipboardCheck,
    sources: FolderOpen,
  }[icon];

  return (
    <TeacherPendingLink
      aria-current={active ? "page" : undefined}
      className={[
        "teacher-focus-ring flex min-h-11 items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors duration-200",
        presentation === "menu" ? "w-full" : "shrink-0",
        active
          ? "bg-[#E8F2FF] text-[#0066CC]"
          : "text-[#6E6E73] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]",
      ].join(" ")}
      feedback="page"
      href={href}
      onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
      pendingLabel={`${label} Library page`}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </TeacherPendingLink>
  );
}

function BankContextNavItems({ items, pathname }: { items: BankContextNavItem[]; pathname: string }) {
  return (
    <nav aria-label="Library navigation" className="grid gap-1">
      {items.map((item) => (
        <BankContextNavLink
          {...item}
          active={isActivePath(item.href, pathname)}
          key={item.href}
          presentation="menu"
        />
      ))}
    </nav>
  );
}

export function BankContextNav(props: BankContextNavProps) {
  const pathname = usePathname() ?? "";
  const activeTool = props.secondaryItems.find((item) => isActivePath(item.href, pathname));

  return (
    <div className="bank-context-nav">
      <div className="hidden min-h-14 items-center gap-1 rounded-[14px] border border-[#D2D2D7] bg-white p-1.5 md:flex">
        <nav aria-label="Library workflow" className="flex min-w-0 items-center gap-1">
          {props.primaryItems.map((item) => (
            <BankContextNavLink
              {...item}
              active={isActivePath(item.href, pathname)}
              key={item.href}
            />
          ))}
        </nav>
        <details className="group relative ml-auto shrink-0">
          <summary
            className={[
              "teacher-focus-ring flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-[10px] px-3 text-sm font-medium transition-colors duration-200",
              activeTool
                ? "bg-[#E8F2FF] text-[#0066CC]"
                : "text-[#6E6E73] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]",
            ].join(" ")}
          >
            {activeTool?.label ?? "More"}
            <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute right-0 z-30 mt-2 w-64 rounded-[14px] border border-[#D2D2D7] bg-white p-2 shadow-[0_12px_34px_rgba(0,0,0,0.12)]">
            <BankContextNavItems items={props.secondaryItems} pathname={pathname} />
          </div>
        </details>
      </div>

      <details className="group rounded-[14px] border border-[#D2D2D7] bg-white md:hidden">
        <summary className="teacher-focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-[14px] px-4 py-3 text-sm font-semibold text-[#1D1D1F]">
          Library menu
          <ChevronDown
            aria-hidden="true"
            className="collapsible-chevron h-4 w-4 text-slate-500"
          />
        </summary>
        <div className="border-t border-[#D2D2D7] p-2">
          <BankContextNavItems items={[...props.primaryItems, ...props.secondaryItems]} pathname={pathname} />
        </div>
      </details>
    </div>
  );
}
