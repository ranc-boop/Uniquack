import type { ReactNode } from "react";

import { AdminInfoTip } from "@/components/admin/admin-info-tip";
import { cn } from "@/lib/utils";

type AdminPageHeaderProps = {
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: string;
  help?: ReactNode;
  helpLabel?: string;
  secondaryActions?: ReactNode;
  title: string;
};

export function AdminPageHeader({
  actions,
  breadcrumbs,
  className,
  description,
  eyebrow,
  help,
  helpLabel,
  secondaryActions,
  title,
}: AdminPageHeaderProps) {
  return (
    <header className={cn("space-y-4", className)}>
      {breadcrumbs ? (
        <div className="text-sm text-muted-foreground">{breadcrumbs}</div>
      ) : null}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                {title}
              </h1>
              {help ? <AdminInfoTip label={helpLabel}>{help}</AdminInfoTip> : null}
            </div>
            {description ? (
              <div className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {description}
              </div>
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
