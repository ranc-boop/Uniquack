"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Boxes, ChartNoAxesColumnIncreasing, GraduationCap, Home, Library, Send } from "lucide-react";

import { cn } from "@/lib/utils";

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
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
              <Link aria-current={selected ? "page" : undefined} className={cn("workspace-nav-item", selected && "is-active")} href={item.href} key={item.href}>
                <Icon aria-hidden="true" className="size-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
