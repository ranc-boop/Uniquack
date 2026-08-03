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
        "loading-indicator inline-flex items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
      role="status"
    >
      <span
        aria-hidden="true"
        className={cn(
          "loading-indicator-spinner shrink-0",
          size === "sm" ? "size-4" : "size-5",
        )}
      />
      <span>{label}</span>
    </span>
  );
}
