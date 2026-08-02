import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requireStudentWorkspace } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type StudentClassroomsPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export default async function StudentClassroomsPage({
  searchParams,
}: StudentClassroomsPageProps) {
  const profile = await requireStudentWorkspace();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("classroom_members")
    .select("classroom_id, role, status, joined_at")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .order("joined_at", { ascending: false });
  const classroomIds = (memberships ?? []).map((member) => member.classroom_id);
  const { data: classrooms, error: classroomError } = classroomIds.length
    ? await supabase
        .from("classrooms")
        .select("id, name, description, subject, status, created_at")
        .in("id", classroomIds)
    : { data: [], error: null };
  const classroomById = new Map(
    (classrooms ?? []).map((classroom) => [classroom.id, classroom]),
  );

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">Student workspace</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              My classes
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Join teacher classrooms here. Assigned work lives in My Work.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/student/work">My Work</Link>
            </Button>
            <Button asChild>
              <Link href="/student/classrooms/join">Join a class</Link>
            </Button>
          </div>
        </div>
      </section>

      {params.saved ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          {params.saved}
        </p>
      ) : null}
      {params.error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {params.error}
        </p>
      ) : null}

      <section className="student-panel overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                Joined classrooms
              </h2>
              <p className="student-muted">
                Active memberships show which classrooms can assign work to you.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              {memberships?.length ?? 0}
            </span>
          </div>
        </div>
        {membershipError || classroomError ? (
          <p className="p-5 text-sm text-destructive">
            {membershipError?.message ?? classroomError?.message}
          </p>
        ) : memberships?.length ? (
          <div className="grid gap-4 p-5 md:grid-cols-2">
            {memberships.map((membership) => {
              const classroom = classroomById.get(membership.classroom_id);
              return (
                <article
                  className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  key={membership.classroom_id}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="min-w-0 break-words text-base font-bold text-slate-950">
                      {classroom?.name ?? "Classroom"}
                    </h3>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Active membership
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {classroom?.subject || "No subject set"} - Joined{" "}
                    {formatDate(membership.joined_at)}
                  </p>
                  {classroom?.description ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {classroom.description}
                    </p>
                  ) : null}
                  <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    Open My Work to start, continue, or review assigned tasks.
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-56 items-center justify-center p-8 text-center">
            <div className="max-w-md space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  No classes joined yet
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Ask your teacher for a join code, then use it to connect your
                  account to the classroom. Your assignments appear in My Work
                  after you join.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href="/student/classrooms/join">Enter join code</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/student/work">Open My Work</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
