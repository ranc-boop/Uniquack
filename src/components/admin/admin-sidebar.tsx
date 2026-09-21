"use client";

import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Boxes,
  ClipboardCheck,
  FileJson,
  LayoutDashboard,
  Library,
  PlaySquare,
  Settings2,
  Tags,
  Users,
} from "lucide-react";

import { AdminPendingLink } from "@/components/admin/admin-pending-link";
import { useLocale } from "@/components/i18n/locale-provider";
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
};

function isActiveItem(item: AdminNavItem, pathname: string) {
  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function AdminNavGroups() {
  const pathname = usePathname();
  const { t } = useLocale();
  const adminNavGroups: AdminNavGroup[] = [
    {
      label: "",
      items: [
        { exact: true, href: "/admin", icon: LayoutDashboard, label: t("admin.overview") },
      ],
    },
    {
      label: t("admin.contentGovernance"),
      items: [
        { exact: true, href: "/admin/questions", icon: Library, label: t("admin.publicLibrary") },
        { href: "/admin/review", icon: ClipboardCheck, label: t("admin.approvalQueue") },
        { href: "/admin/tags", icon: Tags, label: t("admin.taxonomy") },
        { href: "/admin/blueprints", icon: Boxes, label: t("teacher.blueprints") },
        { href: "/admin/videos", icon: PlaySquare, label: t("admin.videos") },
      ],
    },
    {
      label: t("admin.platformOperations"),
      items: [
        { href: "/admin/questions/banks", icon: Library, label: t("admin.librarySupport") },
        { href: "/admin/practice-frameworks", icon: BookOpen, label: t("admin.practiceFrameworks") },
        { href: "/admin/imports", icon: FileJson, label: t("admin.imports") },
        { href: "/admin/users", icon: Users, label: t("admin.users") },
        { href: "/admin/ai-settings", icon: Settings2, label: t("admin.aiSettings") },
      ],
    },
  ];

  return (
    <nav aria-label={t("admin.navigation")} className="space-y-5">
      {adminNavGroups.map((group) => (
          <div className="space-y-2" key={group.label || "primary"}>
            {group.label ? <p className="workspace-nav-label">{group.label}</p> : null}
            <div className="grid gap-1">
              {group.items.map((item) => {
                const active = isActiveItem(item, pathname);
                const Icon = item.icon;

                return (
                  <AdminPendingLink
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "workspace-nav-item",
                      active
                        ? "is-active"
                        : "",
                    )}
                    href={item.href}
                    feedback="page"
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

export function AdminSidebar() {
  const { t } = useLocale();

  return (
    <div>
      <details className="rounded-lg border bg-card p-3 shadow-sm lg:hidden">
        <summary className="cursor-pointer list-none text-sm font-semibold">
          {t("admin.menu")}
        </summary>
        <div className="mt-4">
          <AdminNavGroups />
        </div>
      </details>

      <div className="hidden lg:block">
        <AdminNavGroups />
      </div>
    </div>
  );
}
