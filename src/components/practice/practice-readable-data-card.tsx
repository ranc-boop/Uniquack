import type { ReactNode } from "react";

import { FeedbackText } from "@/components/math-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function compactJson(value: unknown, maxLength = 1600) {
  try {
    const text = JSON.stringify(value ?? {}, null, 2);
    return text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}...` : text;
  } catch {
    return String(value ?? "");
  }
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

function objectHighlights(value: unknown, limit = 5): Array<{ label: string; value: string }> {
  const record = asRecord(value);
  if (!record) return [];
  const priorityKeys = [
    "summary",
    "current_focus",
    "active_misconceptions",
    "confirmed_strengths",
    "training_strategy",
    "next_round_constraints",
    "recommendation_intent",
    "drift_guard",
    "plan_node_id",
  ];
  const entries = [
    ...priorityKeys.filter((key) => key in record),
    ...Object.keys(record).filter((key) => !priorityKeys.includes(key)),
  ];

  return entries
    .map((key) => ({ label: humanizeKey(key), value: plainText(record[key]) }))
    .filter((item) => item.value)
    .slice(0, limit);
}

export function ReadableDataCard({
  children,
  empty,
  title,
  value,
}: {
  children?: ReactNode;
  empty: string;
  title: string;
  value: unknown;
}) {
  const summary = plainText(value);
  const highlights = objectHighlights(value);
  const hasValue = Boolean(summary || highlights.length);

  return (
    <Card className="border-0 bg-white shadow-none ring-1 ring-slate-200/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasValue ? (
          <>
            {summary ? (
              <FeedbackText className="border-none bg-transparent p-0 text-sm leading-6 text-slate-600" compact value={summary} />
            ) : null}
            {highlights.length ? (
              <div className="space-y-2">
                {highlights.map((item) => (
                  <div key={`${title}-${item.label}`} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</p>
                    <FeedbackText className="mt-1 border-none bg-transparent p-0 text-sm leading-6 text-slate-700" compact value={item.value} />
                  </div>
                ))}
              </div>
            ) : null}
            <details className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
              <summary className="cursor-pointer font-semibold text-slate-700">Show raw details</summary>
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-[11px] leading-5 text-slate-500 ring-1 ring-slate-200">
                {compactJson(value, 2400)}
              </pre>
            </details>
          </>
        ) : (
          <p className="text-sm leading-6 text-slate-600">{empty}</p>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
