import { LoadingIndicator } from "@/components/loading-indicator";
import { cn } from "@/lib/utils";

export function PracticeLoadingBlock({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("practice-loading-block", className)} />;
}

export function PracticeSessionLoadingOverlay({
  action,
}: {
  action: "creating" | "switching";
}) {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="practice-loading-overlay absolute inset-0 z-20 flex min-h-[60vh] flex-col justify-center gap-5 px-4"
      role="status"
    >
      <LoadingIndicator
        label={action === "creating" ? "Preparing a new practice session..." : "Switching practice session..."}
        size="md"
      />
      <div className="space-y-3" aria-hidden="true">
        <PracticeLoadingBlock className="h-16 rounded-2xl" />
        <PracticeLoadingBlock className="h-16 rounded-2xl" />
      </div>
    </section>
  );
}
