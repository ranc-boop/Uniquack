import type { ReactNode } from "react";

import { LoadingIndicator } from "@/components/loading-indicator";
import { cn } from "@/lib/utils";

type AdminLoadingStateProps = {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  label: ReactNode;
  rows?: number;
  variant?: "cards" | "inline" | "list";
};

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)}
    />
  );
}

export function AdminLoadingState({
  children,
  className,
  description,
  label,
  rows = 4,
  variant = "list",
}: AdminLoadingStateProps) {
  if (variant === "inline") {
    return (
      <div
        aria-busy="true"
        className={cn(
          "inline-flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground",
          className,
        )}
      >
        <LoadingIndicator label={typeof label === "string" ? label : "Loading..."} />
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      className={cn("space-y-3 rounded-md border bg-card p-4", className)}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        {description ? (
          <div className="text-sm text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {children}
      <div className={cn("grid gap-3", variant === "cards" && "md:grid-cols-2")}>
        {Array.from({ length: rows }).map((_, index) => (
          <div className="space-y-2 rounded-md border bg-background p-3" key={index}>
            <SkeletonBlock className="h-4 w-2/3" />
            <SkeletonBlock className="h-4 w-full" />
            <SkeletonBlock className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
