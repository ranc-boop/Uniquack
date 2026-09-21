"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronDown, Menu } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { useLocale } from "@/components/i18n/locale-provider";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { RouteTransitionFeedback } from "@/components/route-transition-feedback";
import { isTeacherFocusPathname } from "@/lib/teacher-focus-workspace";

type WorkspaceRole = "student" | "teacher" | "admin" | "super_admin" | null;
type Workspace = "student" | "teacher" | "admin";

type AppChromeProps = {
  accountMenu: ReactNode;
  children: ReactNode;
  role: WorkspaceRole;
};

function currentWorkspace(
  pathname: string,
  role: WorkspaceRole,
  requestedWorkspace?: string | null,
): Workspace {
  if (role === "admin" || role === "super_admin") {
    if (pathname === "/questions" || pathname.startsWith("/questions/")) {
      return requestedWorkspace === "student" ? "student" : "teacher";
    }
    if (
      pathname === "/teacher" ||
      pathname.startsWith("/teacher/")
    ) return "teacher";
    if (
      pathname === "/student" ||
      pathname.startsWith("/student/") ||
      pathname === "/practice" ||
      pathname.startsWith("/practice/") ||
      pathname === "/mistakes" ||
      pathname.startsWith("/mistakes/")
    ) {
      return "student";
    }
    return "admin";
  }

  return role === "teacher" ? "teacher" : "student";
}

function availableWorkspaces(role: WorkspaceRole): Workspace[] {
  if (role === "admin" || role === "super_admin") {
    return ["admin", "teacher", "student"];
  }
  return role === "teacher" ? ["teacher"] : ["student"];
}

export function AppChrome({ accountMenu, children, role }: AppChromeProps) {
  const { t } = useLocale();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const workspaceLinks: Record<Workspace, { href: string; label: string }> = {
    admin: { href: "/admin", label: t("roles.admin") },
    teacher: { href: "/teacher", label: t("roles.teacher") },
    student: { href: "/student", label: t("roles.student") },
  };
  const workspacePreviewLabels: Record<Exclude<Workspace, "admin">, string> = {
    teacher: t("roles.teacherPreview"),
    student: t("roles.studentPreview"),
  };
  const workspace = currentWorkspace(pathname, role, searchParams.get("workspace"));
  const isAdmin = workspace === "admin";
  const isTeacher = workspace === "teacher";
  const isAdminPreview = (role === "admin" || role === "super_admin") && !isAdmin;
  const isFocus = isTeacherFocusPathname(pathname);
  const options = availableWorkspaces(role);

  return (
    <div className="workspace-chrome">
      <RouteTransitionFeedback />
      <header className="workspace-topbar">
        <div className="workspace-topbar-inner">
          <Link aria-label={t("chrome.home")} className="workspace-brand" data-route-progress="page" href={workspaceLinks[workspace].href}>
            <span aria-hidden="true" className="workspace-brand-mark">O2I</span>
            <span className="hidden font-semibold tracking-[-0.01em] sm:inline">EduStruct</span>
          </Link>

          <details className="workspace-switcher group relative">
            <summary className="workspace-control" aria-label={t("chrome.currentWorkspace", { workspace: workspaceLinks[workspace].label })}>
              <span>{workspaceLinks[workspace].label}</span>
              {isAdminPreview ? <span className="workspace-preview-chip">{t("chrome.preview")}</span> : null}
              <ChevronDown aria-hidden="true" className="size-4 text-[#6E6E73] transition-transform group-open:rotate-180" />
            </summary>
            <div className="workspace-switcher-menu">
              <p className="workspace-menu-label">{t("chrome.workspace")}</p>
              {options.map((option) => {
                const active = option === workspace;
                const label =
                  (role === "admin" || role === "super_admin") && option !== "admin"
                    ? workspacePreviewLabels[option]
                    : workspaceLinks[option].label;
                return (
                  <Link
                    className="workspace-menu-item"
                    data-route-progress="page"
                    href={workspaceLinks[option].href}
                    key={option}
                    onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
                  >
                    <span>{label}</span>
                    {active ? <Check aria-hidden="true" className="size-4 text-[#0071E3]" /> : null}
                  </Link>
                );
              })}
            </div>
          </details>

          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitcher />
            {accountMenu}
          </div>
        </div>
      </header>

      {isAdminPreview ? (
        <div className="admin-preview-banner" role="status">
          <span className="font-semibold">{t("roles.adminPreview")}</span>
          <span>{t("chrome.adminPreviewNotice", { workspace: workspaceLinks[workspace].label })}</span>
          <Link data-route-progress="page" href="/admin">{t("chrome.returnToAdmin")}</Link>
        </div>
      ) : null}

      {isFocus ? <main className="focus-route-main">{children}</main> : null}

      {!isFocus && isAdmin ? <main className="admin-route-main">{children}</main> : null}

      {!isFocus && isTeacher ? (
        <div className="workspace-layout">
          <aside className="workspace-sidebar hidden lg:block">
            <TeacherWorkspaceNav />
          </aside>
          <details className="workspace-mobile-nav lg:hidden">
            <summary><Menu aria-hidden="true" className="size-4" /> {t("chrome.teacherMenu")}</summary>
            <TeacherWorkspaceNav />
          </details>
          <main className="teacher-route-main">{children}</main>
        </div>
      ) : null}

      {!isFocus && workspace === "student" ? <main className="student-route-main">{children}</main> : null}
    </div>
  );
}
