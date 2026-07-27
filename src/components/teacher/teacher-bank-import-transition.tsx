"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { FileJson, FileText, LoaderCircle, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";

export type TeacherBankImportMode = "ai" | "json" | "manual";

const modes: Array<{
  icon: typeof FileText;
  label: string;
  value: TeacherBankImportMode;
}> = [
  { icon: PenLine, label: "Manual", value: "manual" },
  { icon: FileJson, label: "JSON", value: "json" },
  { icon: FileText, label: "AI Parsing", value: "ai" },
];

function Block({ className }: { className: string }) {
  return (
    <div className={`rounded-md bg-slate-100 motion-safe:animate-pulse ${className}`} />
  );
}

function ImportModeSkeleton({ mode }: { mode: TeacherBankImportMode }) {
  return (
    <div
      aria-busy="true"
      aria-label={`Loading ${mode} import workspace`}
      className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr]"
      role="status"
    >
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <Block className="h-4 w-24" />
          <Block className="mt-3 h-6 w-72 max-w-full" />
          <Block className="mt-3 h-4 w-full max-w-xl" />
        </div>
        <div className="space-y-4 p-5">
          {mode === "manual" ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="space-y-2" key={index}>
                  <Block className="h-4 w-20" />
                  <Block className={index > 3 ? "h-28 w-full" : "h-10 w-full"} />
                </div>
              ))}
            </div>
          ) : mode === "json" ? (
            <>
              <Block className="h-10 w-full" />
              <Block className="h-64 w-full" />
              <div className="flex gap-2">
                <Block className="h-10 w-32" />
                <Block className="h-10 w-36" />
              </div>
            </>
          ) : (
            <>
              <Block className="h-20 w-full" />
              <Block className="h-44 w-full" />
              <div className="grid gap-3 sm:grid-cols-3">
                <Block className="h-16 w-full" />
                <Block className="h-16 w-full" />
                <Block className="h-16 w-full" />
              </div>
            </>
          )}
        </div>
      </section>
      <aside className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <Block className="h-6 w-40" />
          <Block className="mt-3 h-4 w-full" />
        </div>
        <div className="space-y-3 p-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="space-y-2 rounded-md border p-3" key={index}>
              <Block className="h-4 w-2/3" />
              <Block className="h-4 w-full" />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

export function TeacherBankImportTransition({
  bankId,
  children,
  mode,
}: {
  bankId: string;
  children: ReactNode;
  mode: TeacherBankImportMode;
}) {
  const router = useRouter();
  const [pendingMode, setPendingMode] = useState<TeacherBankImportMode | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const hrefFor = (value: TeacherBankImportMode) =>
    `/teacher/banks/${bankId}/imports?mode=${value}`;

  function preload(value: TeacherBankImportMode) {
    if (value !== mode) router.prefetch(hrefFor(value));
  }

  function selectMode(value: TeacherBankImportMode) {
    if (value === mode || isPending) return;
    setPendingMode(value);
    startTransition(() => router.push(hrefFor(value)));
  }

  return (
    <>
      <nav
        aria-label="Library import modes"
        className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
      >
        {modes.map(({ icon: Icon, label, value }) => {
          const selected = mode === value;
          const waiting = isPending && pendingMode === value;

          return (
            <Button
              aria-current={selected ? "page" : undefined}
              disabled={isPending && !waiting}
              key={value}
              onClick={() => selectMode(value)}
              onFocus={() => preload(value)}
              onMouseEnter={() => preload(value)}
              type="button"
              variant={selected ? "default" : "ghost"}
            >
              {waiting ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 motion-safe:animate-spin"
                />
              ) : (
                <Icon aria-hidden="true" className="size-4" />
              )}
              {waiting ? `Loading ${label}...` : label}
            </Button>
          );
        })}
      </nav>

      {isPending && pendingMode ? (
        <ImportModeSkeleton mode={pendingMode} />
      ) : (
        children
      )}
    </>
  );
}
