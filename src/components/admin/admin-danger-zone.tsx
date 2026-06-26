import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminDangerZoneProps = {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  description?: ReactNode;
  title?: ReactNode;
};

export function AdminDangerZone({
  children,
  className,
  compact = false,
  description,
  title = "Danger zone",
}: AdminDangerZoneProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-destructive/30 bg-destructive/5",
        compact ? "px-3 py-2" : "space-y-3 p-4",
        className,
      )}
    >
      <div className={cn(compact ? "sr-only" : "space-y-1")}>
        <p className="text-sm font-semibold text-destructive">{title}</p>
        {description ? (
          <div className="text-sm leading-6 text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      <div className={cn(compact && "flex flex-wrap items-center gap-2")}>
        {children}
      </div>
    </div>
  );
}
