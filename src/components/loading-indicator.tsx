import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type LoadingIndicatorProps = {
  className?: string;
  label?: string;
  size?: "sm" | "md";
};

export function LoadingIndicator({
  className,
  label = "Loading...",
  size = "sm",
}: LoadingIndicatorProps) {
  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
      role="status"
    >
      <LoaderCircle
        aria-hidden="true"
        className={cn(
          "shrink-0 motion-safe:animate-spin",
          size === "sm" ? "size-4" : "size-5",
        )}
      />
      <span>{label}</span>
    </span>
  );
}
