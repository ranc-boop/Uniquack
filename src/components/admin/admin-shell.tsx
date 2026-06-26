import type { ComponentProps, ReactNode } from "react";

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
    <div className="mx-auto w-full max-w-[100rem]">
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-4">
            <AdminSidebar role={role} username={username} />
            <form action={signOutAction}>
              <Button type="submit" variant="outline" className="w-full">
                Sign out
              </Button>
            </form>
          </div>
        </aside>
        <section className="min-w-0 space-y-6">{children}</section>
      </div>
    </div>
  );
}
