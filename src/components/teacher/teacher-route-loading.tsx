export function TeacherRouteLoading({
  label,
}: {
  label: string;
}) {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="teacher-shell space-y-5"
    >
      <p className="sr-only">Loading {label}.</p>
      <section className="teacher-panel animate-pulse p-6 motion-reduce:animate-none">
        <div className="h-3 w-28 rounded bg-slate-200" />
        <div className="mt-4 h-8 w-full max-w-xl rounded bg-slate-200" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded bg-slate-100" />
      </section>
      <section className="teacher-panel animate-pulse p-6 motion-reduce:animate-none">
        <div className="h-5 w-44 rounded bg-slate-200" />
        <div className="mt-5 grid gap-3">
          <div className="h-16 rounded-lg bg-slate-100" />
          <div className="h-16 rounded-lg bg-slate-100" />
          <div className="h-16 rounded-lg bg-slate-100" />
        </div>
      </section>
    </main>
  );
}
