import type { ReactNode } from "react";

import { AdminInfoTip } from "@/components/admin/admin-info-tip";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

const adminHeaderMessageKeys: Record<string, MessageKey> = {
  "AI PDF Import": "admin.aiPdfImport",
  "AI Settings": "admin.aiSettings",
  "Approval Queue": "admin.approvalQueue",
  "Bulk asset upload": "admin.bulkAssetUpload",
  "Create question": "admin.createQuestion",
  "Create revision": "admin.createRevision",
  "Import Tools": "admin.importTools",
  "Library Support": "admin.librarySupport",
  "Package import": "admin.packageImport",
  "Practice Frameworks": "admin.practiceFrameworks",
  "Public Library": "admin.publicLibrary",
  "Taxonomy": "admin.taxonomy",
  "Teacher Submissions": "admin.teacherSubmissions",
  "Videos": "admin.videos",
};

function localizedAdminHeaderText(locale: "en" | "zh-CN", value: string) {
  const key = adminHeaderMessageKeys[value];
  return key ? translate(locale, key) : value;
}

type AdminPageHeaderProps = {
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
  description?: ReactNode;
  descriptionMode?: "visible" | "tooltip";
  eyebrow?: string;
  help?: ReactNode;
  helpLabel?: string;
  secondaryActions?: ReactNode;
  title: string;
};

export async function AdminPageHeader({
  actions,
  breadcrumbs,
  className,
  description,
  descriptionMode = "visible",
  eyebrow,
  help,
  helpLabel,
  secondaryActions,
  title,
}: AdminPageHeaderProps) {
  const locale = await getRequestLocale();
  const localizedTitle = localizedAdminHeaderText(locale, title);

  return (
    <header className={cn("space-y-4", className)}>
      {breadcrumbs ? (
        <div className="text-sm text-muted-foreground">{breadcrumbs}</div>
      ) : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <p className="sr-only">
              {eyebrow}
            </p>
          ) : null}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                {localizedTitle}
              </h1>
              {help ? <AdminInfoTip label={helpLabel}>{help}</AdminInfoTip> : null}
            </div>
            {description && descriptionMode === "visible" ? (
              <div className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {description}
              </div>
            ) : null}
            {description && descriptionMode === "tooltip" && !help ? (
              <AdminInfoTip label={helpLabel ?? translate(locale, "common.pageDetails")}>
                {description}
              </AdminInfoTip>
            ) : null}
          </div>
        </div>
        {actions || secondaryActions ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {secondaryActions}
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
