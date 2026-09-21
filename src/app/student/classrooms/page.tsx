import { StudentPendingLink } from "@/components/student/student-pending-link";
import { Button } from "@/components/ui/button";
import { requireStudentWorkspace } from "@/lib/auth/guards";
import { formatDate, formatNumber } from "@/lib/i18n/locale";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type StudentClassroomsPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function StudentClassroomsPage({
  searchParams,
}: StudentClassroomsPageProps) {
  const [profile, params, locale] = await Promise.all([
    requireStudentWorkspace(),
    searchParams,
    getRequestLocale(),
  ]);
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
    <main className="space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {translate(locale, "classrooms.title")}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <StudentPendingLink href="/student/work">{translate(locale, "student.myWork")}</StudentPendingLink>
            </Button>
            <Button asChild>
              <StudentPendingLink href="/student/classrooms/join">{translate(locale, "work.joinClass")}</StudentPendingLink>
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
          {translate(locale, "common.requestFailed")}
        </p>
      ) : null}

      <section className="student-panel overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">
                {translate(locale, "classrooms.joined")}
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
              {formatNumber(locale, memberships?.length ?? 0)}
            </span>
          </div>
        </div>
        {membershipError || classroomError ? (
          <p className="p-5 text-sm text-destructive">
            {translate(locale, "common.requestFailed")}
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
                      {classroom?.name ?? translate(locale, "classrooms.unnamed")}
                    </h3>
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                      {translate(locale, "classrooms.activeMembership")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {classroom?.subject || translate(locale, "classrooms.noSubject")} - {translate(locale, "classrooms.joinedDate", { date: membership.joined_at ? formatDate(locale, membership.joined_at) : translate(locale, "classrooms.notSet") })}
                  </p>
                  {classroom?.description ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {classroom.description}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-56 items-center justify-center p-8 text-center">
            <div className="max-w-md space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-950">
                  {translate(locale, "classrooms.emptyTitle")}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {translate(locale, "classrooms.emptyDescription")}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <StudentPendingLink href="/student/classrooms/join">
                    {translate(locale, "classrooms.enterCode")}
                  </StudentPendingLink>
                </Button>
                <Button asChild variant="outline">
                  <StudentPendingLink href="/student/work">{translate(locale, "student.openMyWork")}</StudentPendingLink>
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
