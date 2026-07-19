export type PipelineTimelineStep = {
  label: string;
  state: "done" | "current" | "pending";
};

function stateClass(state: PipelineTimelineStep["state"]) {
  if (state === "done") {
    return "border-emerald-200 bg-emerald-50 text-emerald-900";
  }

  if (state === "current") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-muted bg-muted/30 text-muted-foreground";
}

function stateDotClass(state: PipelineTimelineStep["state"]) {
  if (state === "done") return "bg-emerald-500";
  if (state === "current") return "bg-amber-500";
  return "bg-muted-foreground/30";
}

export function PipelineTimeline({
  timeline,
}: {
  timeline: PipelineTimelineStep[];
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Pipeline</p>
        <span className="text-xs text-muted-foreground">
          {timeline.filter((step) => step.state === "done").length}/{timeline.length}
        </span>
      </div>
      <ol className="grid gap-1.5 md:grid-cols-2" aria-label="Import pipeline">
        {timeline.map((step, index) => (
          <li
            key={step.label}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${stateClass(
              step.state,
            )}`}
            role="listitem"
            title={`${step.label}: ${step.state}`}
          >
            <span className={`size-1.5 shrink-0 rounded-full ${stateDotClass(step.state)}`} aria-hidden="true" />
            <span className="min-w-0 truncate font-medium">{index + 1}. {step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
