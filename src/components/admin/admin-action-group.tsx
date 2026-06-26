import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminActionGroupProps = {
  advanced?: ReactNode;
  className?: string;
  destructive?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
};

export function AdminActionGroup({
  advanced,
  className,
  destructive,
  primary,
  secondary,
}: AdminActionGroupProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {secondary ? <div className="flex flex-wrap items-center gap-2">{secondary}</div> : null}
      {advanced ? (
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {advanced}
        </div>
      ) : null}
      {destructive ? (
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {destructive}
        </div>
      ) : null}
      {primary ? <div className="flex flex-wrap items-center gap-2">{primary}</div> : null}
    </div>
  );
}
