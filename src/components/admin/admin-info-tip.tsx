import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminInfoTipProps = {
  children: ReactNode;
  className?: string;
  label?: string;
  panelClassName?: string;
};

export function AdminInfoTip({
  children,
  className,
  label = "More information",
  panelClassName,
}: AdminInfoTipProps) {
  return (
    <details
      className={cn("group relative inline-block align-middle", className)}
    >
      <summary
        aria-label={label}
        className="inline-flex size-7 cursor-help list-none items-center justify-center rounded-full border bg-background text-xs font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true">?</span>
      </summary>
      <div
        className={cn(
          "absolute left-0 top-full z-50 mt-2 hidden w-72 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-3 text-left text-xs leading-5 text-popover-foreground shadow-md group-focus-within:block group-hover:block group-open:block",
          panelClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
