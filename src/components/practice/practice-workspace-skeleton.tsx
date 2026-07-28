export function PracticeWorkspaceSkeleton({
  mode = "starter",
}: {
  mode?: "assignment" | "starter";
}) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="mx-[calc(50%-50vw)] grid min-h-[calc(100vh-7rem)] w-screen gap-4 px-3 sm:px-4 xl:grid-cols-[19rem_minmax(0,1fr)_3rem]"
      role="status"
    >
      <span className="sr-only">Loading practice workspace…</span>
      <aside className="hidden min-h-full border-r border-slate-200 bg-slate-50/80 px-4 py-6 xl:block">
        <div className="h-6 w-24 rounded bg-slate-200 motion-safe:animate-pulse" />
        <div className="mt-9 flex h-14 items-center gap-3 rounded-xl bg-white px-3 ring-1 ring-slate-200">
          <div className="size-9 rounded-md bg-sky-100 motion-safe:animate-pulse" />
          <div className="h-4 w-32 rounded bg-slate-100 motion-safe:animate-pulse" />
        </div>
        <div className="mt-8">
          <div className="flex items-center gap-3">
            <div className="h-4 w-14 rounded bg-slate-200 motion-safe:animate-pulse" />
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="mt-4 space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-3" key={index}>
                <div className="h-7 w-1 rounded-full bg-slate-200 motion-safe:animate-pulse" />
                <div className="h-4 flex-1 rounded bg-slate-100 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </aside>
      <main className="relative min-w-0 px-0 xl:px-2">
        <section className="flex min-h-[calc(100vh-10rem)] items-center justify-center py-10">
          <div className="mx-auto w-full max-w-6xl space-y-8 text-center">
            <div className="space-y-3">
              <div className="mx-auto h-6 w-28 rounded-full bg-sky-100 motion-safe:animate-pulse" />
              <div className="mx-auto h-12 w-80 max-w-full rounded-xl bg-slate-200 motion-safe:animate-pulse" />
              <div className="mx-auto h-5 w-[32rem] max-w-full rounded bg-slate-100 motion-safe:animate-pulse" />
            </div>
            {mode === "starter" ? (
              <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white/90 p-4 text-left shadow-sm sm:grid-cols-2 lg:grid-cols-3">
                <div className="h-5 w-36 rounded bg-slate-200 motion-safe:animate-pulse sm:col-span-2 lg:col-span-3" />
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    className="h-16 rounded-xl bg-slate-100 motion-safe:animate-pulse"
                    key={index}
                  />
                ))}
              </div>
            ) : (
              <div className="h-16 rounded-xl border border-sky-100 bg-sky-50 motion-safe:animate-pulse" />
            )}
            <div className="rounded-full border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-slate-950/5">
              <div className="flex h-14 items-center gap-3 px-3">
                <div className="h-5 flex-1 rounded bg-slate-100 motion-safe:animate-pulse" />
                <div className="h-10 w-28 rounded-full bg-slate-100 motion-safe:animate-pulse" />
                <div className="size-12 rounded-full bg-sky-100 motion-safe:animate-pulse" />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  className="h-12 rounded-full border border-slate-100 bg-white motion-safe:animate-pulse"
                  key={index}
                />
              ))}
            </div>
          </div>
        </section>
      </main>
      <aside className="hidden min-h-full flex-col items-center border-l border-slate-200 bg-slate-50/80 px-2 py-5 xl:flex">
        <div className="size-10 rounded-xl bg-slate-200 motion-safe:animate-pulse" />
        <div className="mt-8 size-10 rounded-xl bg-slate-100 motion-safe:animate-pulse" />
        <div className="mt-auto size-9 rounded-full bg-slate-200 motion-safe:animate-pulse" />
      </aside>
    </div>
  );
}
