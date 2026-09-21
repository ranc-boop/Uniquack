"use client";

import { LoadingIndicator } from "@/components/loading-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { PracticeLoadingBlock } from "@/components/practice/practice-loading";

export function PracticeWorkspaceSkeleton({
  mode = "starter",
}: {
  mode?: "assignment" | "starter";
}) {
  const { t } = useLocale();

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-[calc(50%-50vw)] grid min-h-[calc(100vh-7rem)] w-screen gap-4 px-3 sm:px-4 xl:grid-cols-[19rem_minmax(0,1fr)_3rem]"
      role="status"
    >
      <span className="sr-only">{t("practice.loadingWorkspace")}</span>
      <aside className="hidden min-h-full border-r border-slate-200 bg-slate-50/80 px-4 py-6 xl:block">
        <PracticeLoadingBlock className="h-6 w-24 rounded" />
        <div className="mt-9 flex h-14 items-center gap-3 rounded-xl bg-white px-3 ring-1 ring-slate-200">
          <PracticeLoadingBlock className="size-9 rounded-md" />
          <PracticeLoadingBlock className="h-4 w-32 rounded" />
        </div>
        <div className="mt-8">
          <div className="flex items-center gap-3">
            <PracticeLoadingBlock className="h-4 w-14 rounded" />
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-3" key={index}>
                <PracticeLoadingBlock className="h-7 w-1 rounded-full" />
                <PracticeLoadingBlock className="h-4 flex-1 rounded" />
              </div>
            ))}
          </div>
        </div>
      </aside>
      <main className="relative min-w-0 px-0 xl:px-2">
        <section className="flex min-h-[calc(100vh-10rem)] items-center justify-center py-10">
          <div className="mx-auto w-full max-w-6xl space-y-8 text-center">
            <LoadingIndicator className="justify-center" label={t("practice.loadingWorkspace")} size="md" />
            <div className="space-y-3">
              <PracticeLoadingBlock className="mx-auto h-6 w-28 rounded-full" />
              <PracticeLoadingBlock className="mx-auto h-12 w-80 max-w-full rounded-xl" />
              <PracticeLoadingBlock className="mx-auto h-5 w-[32rem] max-w-full rounded" />
            </div>
            {mode === "starter" ? (
              <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white/90 p-4 text-left shadow-sm sm:grid-cols-2 lg:grid-cols-3">
                <PracticeLoadingBlock className="h-5 w-36 rounded sm:col-span-2 lg:col-span-3" />
                {Array.from({ length: 3 }).map((_, index) => (
                  <PracticeLoadingBlock className="h-16 rounded-xl" key={index} />
                ))}
              </div>
            ) : (
              <PracticeLoadingBlock className="h-16 rounded-xl border border-sky-100" />
            )}
            <div className="rounded-full border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-slate-950/5">
              <div className="flex h-14 items-center gap-3 px-3">
                <PracticeLoadingBlock className="h-5 flex-1 rounded" />
                <PracticeLoadingBlock className="h-10 w-28 rounded-full" />
                <PracticeLoadingBlock className="size-12 rounded-full" />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <PracticeLoadingBlock className="h-12 rounded-full border border-slate-100" key={index} />
              ))}
            </div>
          </div>
        </section>
      </main>
      <aside className="hidden min-h-full flex-col items-center border-l border-slate-200 bg-slate-50/80 px-2 py-5 xl:flex">
        <PracticeLoadingBlock className="size-10 rounded-xl" />
        <PracticeLoadingBlock className="mt-8 size-10 rounded-xl" />
        <PracticeLoadingBlock className="mt-auto size-9 rounded-full" />
      </aside>
    </div>
  );
}
