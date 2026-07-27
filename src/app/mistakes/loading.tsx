import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function MistakesLoading() {
  return (
    <main aria-busy="true" className="space-y-5" role="status">
      <span className="sr-only">Loading missed questions…</span>
      <section className="student-hero space-y-3">
        <div className="h-4 w-24 rounded bg-slate-100 motion-safe:animate-pulse" />
        <div className="h-9 w-72 max-w-full rounded bg-slate-100 motion-safe:animate-pulse" />
        <div className="h-5 w-[34rem] max-w-full rounded bg-slate-100 motion-safe:animate-pulse" />
      </section>
      <div className="grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card className="student-panel" key={index}>
            <CardHeader className="space-y-3">
              <div className="h-5 w-2/5 rounded bg-slate-100 motion-safe:animate-pulse" />
              <div className="h-7 w-3/5 rounded bg-slate-100 motion-safe:animate-pulse" />
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="h-28 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
              <div className="h-28 rounded-lg bg-slate-100 motion-safe:animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
