import { StudentWorkspaceShell } from "@/components/student/student-workspace-shell";

function Skeleton({
  className,
}: {
  className: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`${className} rounded bg-slate-100 motion-safe:animate-pulse`}
    />
  );
}

function PageStatus({ label }: { label: string }) {
  return (
    <span className="sr-only" role="status">
      {label}
    </span>
  );
}

export function StudentDashboardLoadingContent() {
  return (
    <div aria-busy="true" className="space-y-6">
      <PageStatus label="Loading dashboard summary…" />
      <section className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="student-panel space-y-3 p-4" key={index}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="student-panel space-y-4 p-5" key={index}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-32" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </section>
    </div>
  );
}

export function StudentWorkLoadingSkeleton() {
  return (
    <main aria-busy="true" className="student-shell space-y-6">
      <PageStatus label="Loading assigned work…" />
      <section className="student-hero">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-9 w-44" />
        <Skeleton className="mt-3 h-5 w-[32rem] max-w-full" />
      </section>
      <section className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="student-panel space-y-3 p-4" key={index}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-10" />
          </div>
        ))}
      </section>
      {Array.from({ length: 2 }).map((_, sectionIndex) => (
        <section className="student-panel overflow-hidden" key={sectionIndex}>
          <div className="space-y-2 border-b border-slate-100 p-5">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
          <div className="grid gap-4 p-5">
            {Array.from({ length: 2 }).map((_, index) => (
              <div className="space-y-3 rounded-lg border border-slate-200 p-4" key={index}>
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-4 w-3/5" />
                <div className="grid gap-2 sm:grid-cols-3">
                  {Array.from({ length: 3 }).map((__, cellIndex) => (
                    <Skeleton className="h-14 w-full" key={cellIndex} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

export function StudentClassroomsLoadingSkeleton() {
  return (
    <main aria-busy="true" className="student-shell space-y-6">
      <PageStatus label="Loading joined classrooms…" />
      <section className="student-hero">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-9 w-48" />
        <Skeleton className="mt-3 h-5 w-[30rem] max-w-full" />
      </section>
      <section className="student-panel overflow-hidden">
        <div className="space-y-2 border-b border-slate-100 p-5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="space-y-3 rounded-lg border border-slate-200 p-4" key={index}>
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-14 w-full" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export function StudentAssignmentLoadingSkeleton() {
  return (
    <main aria-busy="true" className="student-shell space-y-6">
      <PageStatus label="Loading assignment…" />
      <section className="student-hero space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-2/5" />
        <Skeleton className="h-5 w-3/5" />
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="student-panel space-y-3 p-4" key={index}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-28" />
          </div>
        ))}
      </section>
      <section className="student-panel space-y-4 p-5">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-4" key={index}>
            <Skeleton className="size-8 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

export function StudentProgressLoadingSkeleton() {
  return (
    <StudentWorkspaceShell
      eyebrow="Evidence"
      title="Progress / Feedback"
    >
      <div aria-busy="true" className="space-y-6">
        <PageStatus label="Loading progress and feedback…" />
        <section className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="student-panel space-y-3 p-4" key={index}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </section>
      </div>
    </StudentWorkspaceShell>
  );
}

export function StudentJoinClassroomLoadingSkeleton() {
  return (
    <main aria-busy="true" className="student-shell space-y-6">
      <PageStatus label="Loading join-classroom form…" />
      <section className="student-hero">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-9 w-64 max-w-full" />
        <Skeleton className="mt-3 h-5 w-[34rem] max-w-full" />
      </section>
      <section className="student-panel max-w-xl space-y-4 p-5">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-80 max-w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-36" />
      </section>
    </main>
  );
}

export function StudentModuleLoadingSkeleton({
  description,
  eyebrow,
  title,
}: {
  description?: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <StudentWorkspaceShell description={description} eyebrow={eyebrow} title={title}>
      <section aria-busy="true" className="grid gap-4 md:grid-cols-3">
        <PageStatus label={`Loading ${title}…`} />
        {Array.from({ length: 3 }).map((_, index) => (
          <article className="student-panel space-y-3 p-5" key={index}>
            <Skeleton className="h-6 w-3/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </article>
        ))}
      </section>
    </StudentWorkspaceShell>
  );
}
