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

export function PipelineTimeline({
  timeline,
}: {
  timeline: PipelineTimelineStep[];
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Pipeline timeline</p>
      <div className="grid gap-2 md:grid-cols-2">
        {timeline.map((step) => (
          <div
            key={step.label}
            className={`rounded-md border px-3 py-2 text-xs ${stateClass(
              step.state,
            )}`}
          >
            <span className="font-medium">{step.label}</span>
            <span className="ml-2 uppercase">{step.state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
