"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TeacherWorkspaceNavItem = {
  href: string;
  label: string;
};

const teacherWorkspaceNavItems: TeacherWorkspaceNavItem[] = [
  { href: "/teacher", label: "Dashboard" },
  { href: "/teacher/banks", label: "Libraries" },
  { href: "/teacher/blueprints", label: "Blueprints" },
  { href: "/teacher/classrooms", label: "Classrooms" },
  { href: "/teacher/publish", label: "Assignments" },
  { href: "/teacher/progress", label: "Progress" },
];

export function TeacherWorkspaceNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Teacher workflow"
      className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
    >
      {teacherWorkspaceNavItems.map((item) => {
        const active =
          item.href === "/teacher"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={[
              "rounded-md px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
              active
                ? "bg-sky-100 text-sky-950 shadow-sm"
                : "text-slate-600 hover:bg-sky-50 hover:text-sky-800",
            ].join(" ")}
            href={item.href}
            key={`${item.href}-${item.label}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

