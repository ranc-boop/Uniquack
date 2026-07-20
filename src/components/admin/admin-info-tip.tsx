import type { ReactNode } from "react";
import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

type AdminInfoTipProps = {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  label?: string;
  panelClassName?: string;
};

export function AdminInfoTip({
  children,
  className,
  icon,
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
        title={label}
      >
        {icon ?? <Info aria-hidden="true" className="size-3.5" />}
      </summary>
      <div
        className={cn(
          "absolute left-0 top-full z-50 mt-2 hidden w-80 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-3 text-left text-sm leading-6 text-popover-foreground shadow-lg group-focus-within:block group-hover:block group-open:block",
          panelClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
