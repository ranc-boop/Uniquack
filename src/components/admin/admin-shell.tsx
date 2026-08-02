import type { ReactNode } from "react";

import { AdminSidebar } from "@/components/admin/admin-sidebar";

type AdminShellProps = {
  children: ReactNode;
  role: string;
  username: string;
};

export function AdminShell({
  children,
  role,
  username,
}: AdminShellProps) {
  return (
    <div className="admin-shell mx-auto w-full max-w-[110rem] text-slate-950">
      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-[4.5rem] lg:self-start">
          <AdminSidebar role={role} username={username} />
        </aside>
        <section className="admin-page-enter min-w-0 space-y-5">{children}</section>
      </div>
    </div>
  );
}
