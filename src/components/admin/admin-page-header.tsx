import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminPageHeaderProps = {
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow?: string;
  secondaryActions?: ReactNode;
  title: string;
};

export function AdminPageHeader({
  actions,
  breadcrumbs,
  className,
  description,
  eyebrow,
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
            <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
              {title}
            </h1>
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
