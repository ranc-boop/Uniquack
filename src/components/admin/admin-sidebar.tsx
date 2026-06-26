"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AdminNavItem = {
  exact?: boolean;
  href: string;
  label: string;
};

type AdminNavGroup = {
  items: AdminNavItem[];
  label: string;
  superAdminOnly?: boolean;
};

type AdminSidebarProps = {
  role: string;
  username: string;
};

const adminNavGroups: AdminNavGroup[] = [
  {
    label: "Primary",
    items: [
      { exact: true, href: "/admin", label: "Dashboard" },
      { href: "/admin/questions", label: "Questions" },
      { href: "/admin/review", label: "Review Drafts" },
      { href: "/admin/blueprints", label: "Blueprint Library" },
      { href: "/admin/imports/pdf", label: "AI Parsing" },
      { href: "/admin/practice-frameworks", label: "Practice" },
      { href: "/admin/videos", label: "Videos" },
    ],
  },
  {
    label: "Advanced tools",
    items: [
      { exact: true, href: "/admin/imports", label: "Manual JSON Import" },
      { href: "/admin/imports/assets", label: "Bulk Assets" },
      { href: "/admin/imports/package", label: "Package Import" },
      { href: "/admin/tags", label: "Taxonomy" },
    ],
  },
  {
    label: "Settings",
    superAdminOnly: true,
    items: [
      { href: "/admin/ai-settings", label: "AI Settings" },
      { href: "/admin/users", label: "Users" },
    ],
  },
];

function isActiveItem(item: AdminNavItem, pathname: string) {
  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function AdminNavGroups({ role }: Pick<AdminSidebarProps, "role">) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin navigation" className="space-y-5">
      {adminNavGroups
        .filter((group) => !group.superAdminOnly || role === "super_admin")
        .map((group) => (
          <div className="space-y-2" key={group.label}>
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {group.label}
            </p>
            <div className="grid gap-1">
              {group.items.map((item) => {
                const active = isActiveItem(item, pathname);

                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "min-h-10 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                    href={item.href}
                    key={item.href}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
    </nav>
  );
}

export function AdminSidebar({ role, username }: AdminSidebarProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <p className="truncate text-sm font-semibold">{username}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{role}</Badge>
          <span className="text-xs text-muted-foreground">Admin workspace</span>
        </div>
      </div>

      <details className="rounded-lg border bg-card p-3 shadow-sm lg:hidden">
        <summary className="cursor-pointer list-none text-sm font-semibold">
          Admin menu
        </summary>
        <div className="mt-4">
          <AdminNavGroups role={role} />
        </div>
      </details>

      <div className="hidden lg:block">
        <AdminNavGroups role={role} />
      </div>
    </div>
  );
}
