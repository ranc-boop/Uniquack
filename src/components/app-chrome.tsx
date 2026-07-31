"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { isTeacherFocusPathname } from "@/lib/teacher-focus-workspace";

type AppChromeProps = {
  children: ReactNode;
  header: ReactNode;
};

export function AppChrome({ children, header }: AppChromeProps) {
  const pathname = usePathname() ?? "";
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const isTeacher = pathname === "/teacher" || pathname.startsWith("/teacher/");
  const isTeacherFocus = isTeacherFocusPathname(pathname);

  if (isTeacherFocus) {
    return <div className="focus-route-main">{children}</div>;
  }

  return (
    <>
      <div className={isAdmin ? "hidden" : undefined}>{header}</div>
      <main
        className={
          isAdmin
            ? "admin-route-main"
            : isTeacher
              ? "teacher-route-main"
              : "student-shell"
        }
      >
        {children}
      </main>
    </>
  );
}
