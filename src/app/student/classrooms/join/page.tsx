import { joinClassroomByCode } from "@/app/student/classrooms/join/actions";
import { FormSubmitButton } from "@/components/form-submit-button";
import { StudentPendingLink } from "@/components/student/student-pending-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireStudentWorkspace } from "@/lib/auth/guards";
import { translate } from "@/lib/i18n/messages";
import { getRequestLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type JoinClassroomPageProps = {
  searchParams: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function JoinClassroomPage({
  searchParams,
}: JoinClassroomPageProps) {
  const [, params, locale] = await Promise.all([
    requireStudentWorkspace(),
    searchParams,
    getRequestLocale(),
  ]);

  return (
    <main className="space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">{translate(locale, "classrooms.joinEyebrow")}</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              {translate(locale, "classrooms.joinTitle")}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              {translate(locale, "classrooms.joinDescription")}
            </p>
          </div>
          <Button asChild variant="outline">
            <StudentPendingLink href="/student/classrooms">{translate(locale, "classrooms.title")}</StudentPendingLink>
          </Button>
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

      <section className="student-panel max-w-xl p-5">
        <h2 className="text-lg font-bold text-slate-950">{translate(locale, "classrooms.joinByCode")}</h2>
        <p className="student-muted">
          {translate(locale, "classrooms.joinCodeHint")}
        </p>
        <form action={joinClassroomByCode} className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join_code">{translate(locale, "classrooms.classCode")}</Label>
            <Input
              autoCapitalize="characters"
              autoComplete="off"
              className="text-lg font-semibold tracking-[0.12em]"
              id="join_code"
              maxLength={32}
              name="join_code"
              placeholder="ABCD-2345"
              required
            />
          </div>
          <FormSubmitButton pendingLabel={translate(locale, "classrooms.joining")}>
            {translate(locale, "classrooms.join")}
          </FormSubmitButton>
        </form>
      </section>
    </main>
  );
}
