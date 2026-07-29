export default function TeacherBankWorkspaceLoading() {
  return (
    <div aria-busy="true" className="space-y-6" role="status">
      <span className="sr-only">Loading Library workspace...</span>
      <section className="rounded-lg border border-slate-200/80 bg-white/90 p-6 shadow-sm">
        <div className="h-4 w-28 rounded bg-slate-100 motion-safe:animate-pulse" />
        <div className="mt-4 h-8 w-72 max-w-full rounded bg-slate-100 motion-safe:animate-pulse" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded bg-slate-100 motion-safe:animate-pulse" />
      </section>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            className="h-10 w-28 shrink-0 rounded-md bg-slate-100 motion-safe:animate-pulse"
            key={index}
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.8fr]">
        <div className="h-96 rounded-lg border border-slate-200 bg-white shadow-sm" />
        <div className="h-80 rounded-lg border border-slate-200 bg-white shadow-sm" />
      </div>
    </div>
  );
}
