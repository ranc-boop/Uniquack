"use client";

import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Boxes, ChartNoAxesColumnIncreasing, GraduationCap, Home, Library, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { TeacherPendingLink } from "@/components/teacher/teacher-pending-link";
import { useLocale } from "@/components/i18n/locale-provider";

type TeacherNavItem = { href: string; icon: LucideIcon; label: string; exact?: boolean };

function active(item: TeacherNavItem, pathname: string) {
  const targetPath = item.href.split("?")[0];
  return item.exact ? pathname === targetPath : pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

export function TeacherWorkspaceNav() {
  const pathname = usePathname() ?? "";
  const { t } = useLocale();
  const groups: Array<{ label: string; items: TeacherNavItem[] }> = [
    { label: "", items: [{ href: "/teacher", label: t("teacher.home"), icon: Home, exact: true }] },
    {
      label: t("teacher.content"),
      items: [
        { href: "/teacher/banks", label: t("teacher.myLibraries"), icon: Library },
        { href: "/questions?workspace=teacher", label: t("teacher.publicLibrary"), icon: BookOpen },
        { href: "/teacher/blueprints", label: t("teacher.blueprints"), icon: Boxes },
      ],
    },
    {
      label: t("teacher.teaching"),
      items: [
        { href: "/teacher/publish", label: t("teacher.assignments"), icon: Send },
        { href: "/teacher/classrooms", label: t("teacher.classrooms"), icon: GraduationCap },
        { href: "/teacher/progress", label: t("teacher.progress"), icon: ChartNoAxesColumnIncreasing },
      ],
    },
  ];

  return (
    <nav aria-label={t("teacher.workspace")} className="workspace-nav">
      {groups.map((group, index) => (
        <div className="workspace-nav-group" key={group.label || `primary-${index}`}>
          {group.label ? <p className="workspace-nav-label">{group.label}</p> : null}
          {group.items.map((item) => {
            const Icon = item.icon;
            const selected = active(item, pathname);
            return (
              <TeacherPendingLink aria-current={selected ? "page" : undefined} className={cn("workspace-nav-item", selected && "is-active")} feedback="page" href={item.href} key={item.href} pendingLabel={item.label}>
                <Icon aria-hidden="true" className="size-4" />
                <span>{item.label}</span>
              </TeacherPendingLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
