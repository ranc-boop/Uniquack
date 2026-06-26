import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AdminDebugDisclosureProps = {
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  title?: ReactNode;
};

export function AdminDebugDisclosure({
  children,
  className,
  description,
  title = "Debug details",
}: AdminDebugDisclosureProps) {
  return (
    <details
      className={cn(
        "rounded-md border bg-muted/20 px-3 py-2 text-sm",
        className,
      )}
    >
      <summary className="cursor-pointer list-none font-medium text-muted-foreground">
        {title}
      </summary>
      {description ? (
        <div className="mt-2 text-muted-foreground">{description}</div>
      ) : null}
      <div className="mt-3 min-w-0 overflow-x-auto rounded-md border bg-background p-3 text-xs">
        {children}
      </div>
    </details>
  );
}
