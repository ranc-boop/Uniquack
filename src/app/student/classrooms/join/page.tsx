import Link from "next/link";

import { joinClassroomByCode } from "@/app/student/classrooms/join/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireStudent } from "@/lib/auth/guards";

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
  await requireStudent();
  const params = await searchParams;

  return (
    <main className="student-shell space-y-6">
      <section className="student-hero">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="student-eyebrow">Join classroom</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Enter your class code
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-600">
              Use the code from your teacher to add this classroom to your
              account.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/student/classrooms">My classes</Link>
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
          {params.error}
        </p>
      ) : null}

      <section className="student-panel max-w-xl p-5">
        <h2 className="text-lg font-bold text-slate-950">Join by code</h2>
        <p className="student-muted">
          Codes are not case-sensitive. Spaces and hyphens are okay.
        </p>
        <form action={joinClassroomByCode} className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join_code">Class code</Label>
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
          <Button type="submit">Join classroom</Button>
        </form>
      </section>
    </main>
  );
}
