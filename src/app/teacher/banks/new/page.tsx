import Link from "next/link";

import { FormSubmitButton } from "@/components/form-submit-button";
import { Button } from "@/components/ui/button";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { requireTeacher } from "@/lib/auth/guards";

import { createQuestionBank } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTeacherBankPage() {
  await requireTeacher();

  return (
    <main className="teacher-shell space-y-6">
      <section className="teacher-hero">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="teacher-eyebrow">Create Library</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Start a teacher-owned content library.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-slate-600">
              Libraries are the source of truth for reviewed questions before they
              move into classrooms, assignments, and student practice.
            </p>
          </div>
          <TeacherWorkspaceNav />
        </div>
      </section>

      <form action={createQuestionBank} className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-6">
          <h2 className="text-xl font-bold text-slate-950">
            Library details
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Private Libraries are the default. Shared and organization
            visibility enable collaboration without publishing anything to
            students or the Central Public Library.
          </p>
        </div>

        <div className="space-y-5 p-6">
          <label className="block">
            <span className="text-sm font-semibold text-slate-900">
              Library name
            </span>
            <input
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              maxLength={120}
              name="name"
              placeholder="AP Calculus BC private Library"
              required
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-slate-900">
              Description
            </span>
            <textarea
              className="mt-2 min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
              maxLength={2000}
              name="description"
              placeholder="What this Library is for, who owns it, and what reviewed content belongs here."
            />
          </label>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-900">
              Visibility
            </legend>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                {
                  description: "Only the Library owner and invited members.",
                  label: "Private",
                  value: "private",
                },
                {
                  description: "Teacher collaborators can be added later.",
                  label: "Shared",
                  value: "shared",
                },
                {
                  description: "Visible to organization staff under RLS.",
                  label: "Organization",
                  value: "organization",
                },
              ].map((option) => (
                <label
                  className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm transition focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100"
                  key={option.value}
                >
                  <input
                    className="mt-1 h-4 w-4 accent-sky-600"
                    defaultChecked={option.value === "private"}
                    name="visibility"
                    type="radio"
                    value={option.value}
                  />
                  <span>
                    <span className="block font-semibold text-slate-950">
                      {option.label}
                    </span>
                    <span className="mt-1 block leading-6 text-slate-600">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-6">
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Creating a Library creates your owner membership only. Import,
            share-code, approval-to-bank, and assignment-from-bank actions come
            in later review-gated slices.
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher/banks">Cancel</Link>
            </Button>
            <FormSubmitButton pendingLabel="Creating Library...">
              Create Library
            </FormSubmitButton>
          </div>
        </div>
      </form>
    </main>
  );
}
