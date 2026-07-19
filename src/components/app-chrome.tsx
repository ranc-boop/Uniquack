"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

type AppChromeProps = {
  children: ReactNode;
  header: ReactNode;
};

export function AppChrome({ children, header }: AppChromeProps) {
  const pathname = usePathname() ?? "";
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <>
      <div className={isAdmin ? "hidden" : undefined}>{header}</div>
      <main className={isAdmin ? "admin-route-main" : "student-shell"}>
        {children}
      </main>
    </>
  );
}
