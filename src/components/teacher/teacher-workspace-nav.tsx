"use client";

import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Boxes, ChartNoAxesColumnIncreasing, GraduationCap, Home, Library, Send } from "lucide-react";

import { cn } from "@/lib/utils";
import { TeacherPendingLink } from "@/components/teacher/teacher-pending-link";

type TeacherNavItem = { href: string; icon: LucideIcon; label: string; exact?: boolean };

const groups: Array<{ label: string; items: TeacherNavItem[] }> = [
  { label: "", items: [{ href: "/teacher", label: "Home", icon: Home, exact: true }] },
  {
    label: "Content",
    items: [
      { href: "/teacher/banks", label: "My Libraries", icon: Library },
      { href: "/questions?workspace=teacher", label: "Public Library", icon: BookOpen },
      { href: "/teacher/blueprints", label: "Blueprints", icon: Boxes },
    ],
  },
  {
    label: "Teaching",
    items: [
      { href: "/teacher/publish", label: "Assignments", icon: Send },
      { href: "/teacher/classrooms", label: "Classrooms", icon: GraduationCap },
      { href: "/teacher/progress", label: "Progress", icon: ChartNoAxesColumnIncreasing },
    ],
  },
];

function active(item: TeacherNavItem, pathname: string) {
  const targetPath = item.href.split("?")[0];
  return item.exact ? pathname === targetPath : pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

export function TeacherWorkspaceNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Teacher workspace" className="workspace-nav">
      {groups.map((group, index) => (
        <div className="workspace-nav-group" key={group.label || `primary-${index}`}>
          {group.label ? <p className="workspace-nav-label">{group.label}</p> : null}
          {group.items.map((item) => {
            const Icon = item.icon;
            const selected = active(item, pathname);
            return (
              <TeacherPendingLink aria-current={selected ? "page" : undefined} className={cn("workspace-nav-item", selected && "is-active")} href={item.href} key={item.href} pendingLabel={item.label}>
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
