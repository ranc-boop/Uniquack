import type { ReactNode } from "react";

import { AdminInfoTip } from "@/components/admin/admin-info-tip";
import { cn } from "@/lib/utils";

type AdminEmptyStateProps = {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  descriptionMode?: "visible" | "tooltip";
  title: ReactNode;
};

export function AdminEmptyState({
  actions,
  className,
  description,
  descriptionMode = "visible",
  title,
}: AdminEmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-dashed bg-muted/20 p-8 text-center",
        className,
      )}
    >
      <div className="mx-auto max-w-md space-y-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && descriptionMode === "visible" ? (
          <div className="text-sm leading-6 text-muted-foreground">
            {description}
          </div>
        ) : null}
        {description && descriptionMode === "tooltip" ? (
          <AdminInfoTip label="Empty state details">{description}</AdminInfoTip>
        ) : null}
        {actions ? (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
