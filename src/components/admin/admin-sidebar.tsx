"use client";

import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Boxes,
  ClipboardCheck,
  FileCheck2,
  FileJson,
  FileText,
  GraduationCap,
  Images,
  LayoutDashboard,
  Library,
  PackageOpen,
  PlaySquare,
  Settings2,
  Sparkles,
  Tags,
  Upload,
  Users,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { AdminPendingLink } from "@/components/admin/admin-pending-link";
import { cn } from "@/lib/utils";

type AdminNavItem = {
  exact?: boolean;
  href: string;
  icon: LucideIcon;
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
      { exact: true, href: "/admin", icon: LayoutDashboard, label: "Dashboard" },
      { href: "/admin/review", icon: ClipboardCheck, label: "Review Drafts" },
      { href: "/admin/questions", icon: Library, label: "Central Public Library" },
      { href: "/admin/blueprints", icon: Boxes, label: "Blueprint Library" },
      { href: "/admin/practice-frameworks", icon: BookOpen, label: "Practice" },
      { href: "/admin/videos", icon: PlaySquare, label: "Videos" },
    ],
  },
  {
    label: "Advanced tools",
    items: [
      { href: "/admin/imports/pdf", icon: Sparkles, label: "AI Parsing" },
      { exact: true, href: "/admin/imports", icon: FileJson, label: "Manual JSON Import" },
      { href: "/admin/imports/assets", icon: Images, label: "Bulk Assets" },
      { href: "/admin/imports/package", icon: PackageOpen, label: "Package Import" },
      { href: "/admin/tags", icon: Tags, label: "Taxonomy" },
    ],
  },
  {
    label: "Settings",
    superAdminOnly: true,
    items: [
      { href: "/admin/ai-settings", icon: Settings2, label: "AI Settings" },
      { href: "/admin/users", icon: Users, label: "Users" },
    ],
  },
  {
    label: "Experience",
    items: [
      { exact: true, href: "/teacher", icon: GraduationCap, label: "Teacher Studio" },
      { href: "/practice", icon: FileCheck2, label: "Student Practice" },
      { href: "/questions", icon: FileText, label: "Question Bank" },
      { href: "/videos", icon: Upload, label: "Student Videos" },
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
                const Icon = item.icon;

                return (
                  <AdminPendingLink
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                    href={item.href}
                    key={item.href}
                    pendingLabel={item.label}
                    title={item.label}
                  >
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </AdminPendingLink>
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
        <div className="flex items-center gap-2" title={username}>
          <UserRound aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-semibold">
            {username}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Badge aria-label={role === "super_admin" ? "Super admin" : "Admin"} title={role} variant="secondary">
              {role === "super_admin" ? "Super admin" : "Admin"}
            </Badge>
          </div>
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
