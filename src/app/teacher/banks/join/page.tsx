import Link from "next/link";

import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";

import { joinQuestionBankByCode } from "../actions";

export const dynamic = "force-dynamic";

export default async function JoinTeacherBankPage() {
  await requireTeacher();

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="teacher-eyebrow">Join Library by Share Code</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Join a shared Library.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Enter a teacher-issued Library code. Joining a Library is separate from
              joining a classroom.
            </p>
          </div>
        </div>
      </section>

      <form action={joinQuestionBankByCode} className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-6">
          <h2 className="text-xl font-bold text-slate-950">
            Library collaboration code
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Share codes grant explicit Library membership. Classroom membership
            never grants access to a teacher bank.
          </p>
        </div>
        <div className="space-y-5 p-6">
          <label className="block">
            <span className="text-sm font-semibold text-slate-900">
              Share code
            </span>
            <input
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm uppercase tracking-wide text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              maxLength={64}
              name="shareCode"
              placeholder="ABCD-1234"
              required
            />
          </label>
          <div className="rounded-lg border border-sky-100 bg-sky-50/70 p-4 text-sm leading-6 text-sky-950">
            Students should use classroom join codes, not Library share codes.
            Library access is for teacher collaboration and content review.
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-6">
          <Button asChild variant="outline">
            <Link href="/teacher/banks">Back to Libraries</Link>
          </Button>
          <FormSubmitButton pendingLabel="Joining Library...">
            Join Library
          </FormSubmitButton>
        </div>
      </form>
    </main>
  );
}
