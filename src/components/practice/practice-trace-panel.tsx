"use client";

import { ChevronDown, LoaderCircle, Search, Sparkles, Wrench } from "lucide-react";

import { FeedbackText } from "@/components/math-content";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PracticeTraceEvent } from "@/lib/practice/types";

function formatTrace(event: PracticeTraceEvent) {
  return [
    event.outputSummary,
    event.error ? `Error: ${event.error}` : "",
  ].filter(Boolean).join(" ");
}

function isTraceNoise(event: PracticeTraceEvent) {
  return event.toolName === "model_usage" ||
    event.toolName === "model_tool_choice_start" ||
    event.toolName === "compact_agent_context";
}

function displayTraceEvents(trace: PracticeTraceEvent[]) {
  return trace.filter((event) => !isTraceNoise(event));
}

function latestDisplayTrace(trace: PracticeTraceEvent[]) {
  return displayTraceEvents(trace).at(-1) ?? trace.at(-1);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function humanizeKey(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function plainText(value: unknown, maxLength = 260): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.length > maxLength ? `${value.slice(0, maxLength).trimEnd()}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => plainText(item, 90))
      .filter(Boolean)
      .slice(0, 4)
      .join("; ");
  }
  const record = asRecord(value);
  if (!record) return "";
  const preferred = ["summary", "focus", "current_focus", "recommendation_intent", "drift_guard", "next_round_constraints"];
  for (const key of preferred) {
    const text = plainText(record[key], maxLength);
    if (text) return text;
  }
  return Object.entries(record)
    .filter(([, nestedValue]) => typeof nestedValue !== "object" || nestedValue === null)
    .slice(0, 3)
    .map(([key, nestedValue]) => `${humanizeKey(key)}: ${plainText(nestedValue, 80)}`)
    .join(" · ");
}

function readableProcessLabel(event: PracticeTraceEvent) {
  if (event.error) return "Needs attention";
  if (event.toolName === "model_tool_choice") return "Model thought";
  if (event.toolName.includes("browse")) return "Finding the right topic";
  if (event.toolName.includes("search")) return "Looking through question candidates";
  if (event.toolName.includes("finalize")) return "Choosing the round";
  if (event.toolName.includes("review") || event.phase === "review") return "Reviewing your answers";
  return event.phase === "context" ? "Reading session context" : "Thinking";
}

function traceIcon(event: PracticeTraceEvent) {
  if (event.toolName === "model_tool_choice") return <Sparkles className="size-4" aria-hidden="true" />;
  if (event.toolName.includes("search") || event.toolName.includes("browse")) return <Search className="size-4" aria-hidden="true" />;
  if (event.toolName.includes("finalize")) return <Sparkles className="size-4" aria-hidden="true" />;
  if (event.toolName.includes("tool")) return <Wrench className="size-4" aria-hidden="true" />;
  return <Sparkles className="size-4" aria-hidden="true" />;
}

type ToolPill = {
  label?: string;
  value: string;
};

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
}

function pushPill(pills: ToolPill[], value: unknown, label?: string, maxLength = 80) {
  const text = plainText(value, maxLength);
  if (text) pills.push({ label, value: text });
}

function toolInputPills(event: PracticeTraceEvent): ToolPill[] {
  const payload = asRecord(event.inputPayload);
  const args = asRecord(payload?.args);
  const tool = String(payload?.tool ?? event.toolName);
  const pills: ToolPill[] = [];

  if (!args) return pills;

  if (tool === "browse_taxonomy_batch") {
    for (const request of asRecordArray(args.requests).slice(0, 6)) {
      pushPill(pills, request.query ?? request.guess_path ?? request.parent_tag_id ?? request.request_id, String(request.source ?? "request"));
    }
    for (const tagId of Array.isArray(args.keep_tags) ? args.keep_tags.slice(0, 4) : []) {
      pushPill(pills, tagId, "keep");
    }
  } else if (tool === "practice_search_batch") {
    pushPill(pills, args.mode, "mode");
    for (const lane of asRecordArray(args.lanes).slice(0, 5)) {
      pushPill(pills, lane.query_text || lane.rationale || lane.lane_id, String(lane.lane_id ?? "lane"));
      const tags = Array.isArray(lane.confirmed_tag_ids) ? lane.confirmed_tag_ids : [];
      for (const tagId of tags.slice(0, 3)) pushPill(pills, tagId, "tag");
      if (tags.length > 3) pushPill(pills, `+${tags.length - 3}`, "more");
    }
  } else if (tool === "finalize_recommendation") {
    pushPill(pills, args.round_goal, "goal");
    for (const questionId of Array.isArray(args.question_ids) ? args.question_ids.slice(0, 6) : []) {
      pushPill(pills, questionId, "select");
    }
    const contract = asRecord(args.round_contract);
    pushPill(pills, contract?.plan_node_id, "plan");
  } else {
    for (const [key, value] of Object.entries(args).filter(([key]) => key !== "visible_thought").slice(0, 6)) {
      pushPill(pills, value, humanizeKey(key));
    }
  }

  return pills;
}

function toolOutputPills(event: PracticeTraceEvent): ToolPill[] {
  const output = asRecord(event.outputPayload);
  const pills: ToolPill[] = [];

  if (!output) {
    pushPill(pills, formatTrace(event));
    return pills;
  }

  if ("results" in output) {
    const results = asRecordArray(output.results);
    pushPill(pills, results.length, "requests");
    for (const result of results.slice(0, 4)) {
      pushPill(pills, result.query ?? result.request_id, "result");
      const tags = asRecordArray(result.tags);
      if (tags.length) pushPill(pills, `${tags.length} tags`, "found");
    }
  } else if ("candidates" in output || "lane_summaries" in output) {
    const candidates = asRecordArray(output.candidates);
    const laneSummaries = asRecordArray(output.lane_summaries);
    pushPill(pills, output.mode, "mode");
    pushPill(pills, output.candidate_pool_size, "pool");
    pushPill(pills, candidates.length, "candidates");
    for (const lane of laneSummaries.slice(0, 4)) {
      pushPill(pills, `${lane.result_count ?? 0} ${lane.match_quality ?? ""}`.trim(), String(lane.lane_id ?? "lane"));
    }
  } else if ("selected_question_ids" in output) {
    pushPill(pills, output.accepted ? "accepted" : "not accepted", "status");
    for (const questionId of Array.isArray(output.selected_question_ids) ? output.selected_question_ids.slice(0, 6) : []) {
      pushPill(pills, questionId, "selected");
    }
    pushPill(pills, output.candidate_pool_size, "pool");
    pushPill(pills, output.tag_context_size, "tags");
  } else {
    for (const [key, value] of Object.entries(output).slice(0, 8)) {
      pushPill(pills, value, humanizeKey(key));
    }
  }

  if (event.error) pushPill(pills, event.error, "error", 140);
  return pills;
}

function PillList({ empty, pills }: { empty: string; pills: ToolPill[] }) {
  if (!pills.length) {
    return <p className="mt-1 text-sm leading-6 text-slate-600">{empty}</p>;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {pills.map((pill, index) => (
        <span
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm leading-5 text-slate-700"
          key={`${pill.label ?? "pill"}-${pill.value}-${index}`}
          title={pill.label ? `${pill.label}: ${pill.value}` : pill.value}
        >
          {pill.label ? <span className="font-semibold text-slate-500">{pill.label}</span> : null}
          <span className="truncate">{pill.value}</span>
        </span>
      ))}
    </div>
  );
}

function traceSummaryText(event: PracticeTraceEvent | undefined) {
  if (!event) return "Waiting for the agent to start.";
  return event.thoughtSummary || event.inputSummary || event.outputSummary || event.error || "Working through the next step.";
}

function traceEventKey(event: PracticeTraceEvent | undefined) {
  if (!event) return "empty";
  return [
    event.toolName,
    event.iteration ?? "n",
    event.toolCallId ?? "call",
    event.inputSummary ?? "",
    event.outputSummary ?? "",
  ].join(":");
}

function formatElapsed(elapsedMs: number | undefined) {
  if (!elapsedMs) return "a moment";
  return `${Math.max(1, Math.round(elapsedMs / 1000))}s`;
}

function TraceEventSummary({
  animated = false,
  event,
}: {
  animated?: boolean;
  event: PracticeTraceEvent;
}) {
  return (
    <div
      className={[
        "flex min-w-0 items-center gap-3",
        animated ? "animate-in fade-in slide-in-from-bottom-3 duration-300" : "",
      ].filter(Boolean).join(" ")}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
        {traceIcon(event)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-900">{readableProcessLabel(event)}</span>
        <span className="mt-0.5 block truncate text-xs leading-5 text-slate-500">
          {traceSummaryText(event)}
        </span>
      </span>
      {event.elapsedMs !== undefined ? (
        <span className="shrink-0 text-[11px] font-medium text-slate-400">{event.elapsedMs}ms</span>
      ) : null}
    </div>
  );
}

export function TracePanel({
  active = false,
  collapsed = false,
  elapsedMs,
  onToggle,
  trace,
}: {
  active?: boolean;
  collapsed?: boolean;
  elapsedMs?: number;
  onToggle?: () => void;
  trace: PracticeTraceEvent[];
}) {
  if (!trace.length && !active) return null;
  const displayTrace = displayTraceEvents(trace);
  const latestEvent = latestDisplayTrace(trace);

  return (
    <Card className={active ? "animate-in fade-in slide-in-from-bottom-2 border-sky-100 bg-white duration-300" : "border-slate-200/80 bg-white"}>
      <CardContent className="p-3">
        <Button
          aria-expanded={!collapsed}
          className="h-auto w-full justify-start gap-3 whitespace-normal px-1 py-1 text-left hover:bg-transparent"
          onClick={onToggle}
          type="button"
          variant="ghost"
        >
          {active ? (
            <LoaderCircle className="size-4 shrink-0 animate-spin text-sky-600" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4 shrink-0 text-slate-500" aria-hidden="true" />
          )}
          <span className="shrink-0 font-medium text-slate-900">
            {active ? "Thinking" : `Thought for ${formatElapsed(elapsedMs)}`}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-normal text-slate-500">
            {traceSummaryText(latestEvent)}
          </span>
          <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform ${collapsed ? "" : "rotate-180"}`} aria-hidden="true" />
        </Button>
        {!collapsed ? (
          <div className="space-y-2">
            {displayTrace.map((event, index) => (
              <details
                key={`${event.toolName}-${index}`}
                className="group rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm transition-colors duration-200 open:border-sky-200 open:bg-sky-50/40"
                open={active ? index === displayTrace.length - 1 : false}
              >
                <summary className="cursor-pointer list-none">
                  <TraceEventSummary event={event} />
                </summary>
                {event.toolName === "model_tool_choice" ? (
                  <div className="mt-3 rounded-lg border border-sky-100 bg-white p-3">
                    <p className="font-bold text-slate-900">Model-generated thought overview</p>
                    <FeedbackText
                      className="mt-1 border-none bg-transparent p-0 leading-5 text-slate-600"
                      compact
                      value={event.inputSummary || event.modelThought || "The model requested the next tool call."}
                    />
                    {event.reasoningContent ? (
                      <details className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 p-3">
                        <summary className="cursor-pointer font-semibold text-amber-800">Raw reasoning content</summary>
                        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-[11px] leading-5 text-slate-600 ring-1 ring-slate-200">
                          {event.reasoningContent}
                        </pre>
                      </details>
                    ) : null}
                    {event.modelThought && event.modelThought !== event.inputSummary ? (
                      <details className="mt-3 rounded-md border border-slate-200 bg-slate-50/70 p-3">
                        <summary className="cursor-pointer font-semibold text-slate-700">Full original model text</summary>
                        <FeedbackText className="mt-2 border-none bg-transparent p-0 leading-5 text-slate-600" compact value={event.modelThought} />
                      </details>
                    ) : null}
                    {event.outputSummary ? (
                      <p className="mt-2 text-xs leading-5 text-slate-500">{event.outputSummary}</p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    {event.thoughtSummary ? (
                      <div className="mt-3 rounded-lg border border-sky-100 bg-white p-3">
                        <p className="font-bold text-slate-900">Tool thought</p>
                        <FeedbackText className="mt-1 border-none bg-transparent p-0 leading-5 text-slate-600" compact value={event.thoughtSummary} />
                      </div>
                    ) : null}
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
                      <p className="font-bold text-slate-900">What it checked</p>
                      {event.inputPayload ? (
                        <PillList empty="No key input details saved for this step." pills={toolInputPills(event)} />
                      ) : (
                        <FeedbackText className="mt-1 break-words border-none bg-transparent p-0 leading-5 text-slate-600" compact value={event.inputSummary ?? "No input details saved for this step."} />
                      )}
                    </div>
                    {(event.outputPayload || event.outputSummary || event.error) ? (
                      <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
                        <p className="font-bold text-slate-900">What came back</p>
                        {event.outputPayload ? (
                          <PillList empty="No key output details saved for this step." pills={toolOutputPills(event)} />
                        ) : (
                          <FeedbackText
                            className={event.error ? "mt-1 border-none bg-transparent p-0 leading-5 text-destructive" : "mt-1 break-words border-none bg-transparent p-0 leading-5 text-slate-600"}
                            compact
                            value={formatTrace(event)}
                          />
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </details>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
