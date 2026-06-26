import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminEmptyStateProps = {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  title: ReactNode;
};

export function AdminEmptyState({
  actions,
  className,
  description,
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
        {description ? (
          <div className="text-sm leading-6 text-muted-foreground">
            {description}
          </div>
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
