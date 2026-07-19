import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { GraduationCap, LogOut, UserRound } from "lucide-react";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { Button } from "@/components/ui/button";

type AdminShellProps = {
  children: ReactNode;
  role: string;
  signOutAction: NonNullable<ComponentProps<"form">["action"]>;
  username: string;
};

export function AdminShell({
  children,
  role,
  signOutAction,
  username,
}: AdminShellProps) {
  return (
    <div className="admin-shell mx-auto w-full max-w-[110rem] text-slate-950">
      <header className="admin-topbar mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white/95 px-4 py-3 shadow-sm sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground shadow-sm">
            O2I
          </div>
          <div>
            <p className="font-semibold tracking-tight">Admin</p>
            <p className="sr-only">Platform operations</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild aria-label="Open Teacher Studio" size="icon" title="Teacher Studio" variant="outline">
            <Link href="/teacher">
              <GraduationCap aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild aria-label="Open Student Practice" size="icon" title="Student Practice" variant="outline">
            <Link href="/practice">
              <UserRound aria-hidden="true" />
            </Link>
          </Button>
          <form action={signOutAction}>
            <Button aria-label="Sign out" size="icon" title="Sign out" type="submit" variant="ghost">
              <LogOut aria-hidden="true" />
            </Button>
          </form>
        </div>
      </header>
      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <AdminSidebar role={role} username={username} />
        </aside>
        <section className="admin-page-enter min-w-0 space-y-5">{children}</section>
      </div>
    </div>
  );
}
