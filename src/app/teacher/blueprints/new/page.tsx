import Link from "next/link";

import { ArrowLeft, Boxes } from "lucide-react";

import { FormSubmitButton } from "@/components/form-submit-button";
import { TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import {
  canManageBankContent,
  listBankApprovedQuestions,
  listTeacherQuestionBanks,
  QuestionBankSchemaMissingError,
} from "@/lib/question-banks";
import { createClient } from "@/lib/supabase/server";
import {
  BlueprintLibrarySchemaMissingError,
  listTeacherBlueprintLibrary,
} from "@/lib/teacher-blueprints";

import { createTeacherBlueprint } from "../actions";
import { BlueprintSafetyStrip, SetupNeededState } from "../blueprint-library-ui";

export const dynamic = "force-dynamic";

export default async function NewTeacherBlueprintPage({
  searchParams,
}: {
  searchParams: Promise<{ bankId?: string; sourceBankId?: string; error?: string }>;
}) {
  const profile = await requireTeacher();
  const query = await searchParams;
  const supabase = await createClient();

  let banks: Awaited<ReturnType<typeof listTeacherQuestionBanks>> = [];
  let folders: Awaited<ReturnType<typeof listTeacherBlueprintLibrary>>["folders"] = [];
  let sourceQuestions: Awaited<ReturnType<typeof listBankApprovedQuestions>> = [];

  try {
    const [bankRows, library] = await Promise.all([
      listTeacherQuestionBanks({ profileId: profile.id, supabase }),
      listTeacherBlueprintLibrary({ supabase }),
    ]);
    banks = bankRows.filter((bank) => canManageBankContent(bank.membershipRole));
    folders = library.folders;
  } catch (error) {
    if (
      error instanceof QuestionBankSchemaMissingError ||
      error instanceof BlueprintLibrarySchemaMissingError
    ) {
      return (
        <TeacherWorkspaceShell
          title="Create Blueprint"
          description="Create a private planning asset before any question generation or assignment."
        >
          <TeacherWorkspaceNav />
          <SetupNeededState />
        </TeacherWorkspaceShell>
      );
    }

    throw error;
  }

  const requestedBankId = query.bankId ?? query.sourceBankId;
  const selectedBank = banks.find((bank) => bank.id === requestedBankId) ?? null;

  if (selectedBank) {
    sourceQuestions = (await listBankApprovedQuestions({ bankId: selectedBank.id, supabase })).filter(
      (row) => row.status === "active" && row.question?.status === "draft" && !row.question.published_at,
    );
  }
  const selectedQuestionTypes = Array.from(
    new Set(sourceQuestions.map((row) => row.question?.question_type).filter(Boolean)),
  );

  return (
    <TeacherWorkspaceShell
      actions={
        <Button asChild variant="outline">
          <Link href="/teacher/blueprints">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to Blueprint Library
          </Link>
        </Button>
      }
      description="Create a reusable planning asset. It will not generate questions, create Review Drafts, or publish to students."
      eyebrow="Teacher Blueprint workspace"
      title="Create Blueprint"
    >
      <TeacherWorkspaceNav />
      <BlueprintSafetyStrip />

      {query.error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          {query.error === "missing-source-question"
            ? "Select at least one approved source question from the Library."
            : query.error === "invalid-source-question"
              ? "One selected source question is no longer active or assignment-ready."
              : "Blueprint could not be created. Check the required fields and try again."}
        </div>
      ) : null}

      {selectedBank ? (
        <section className="teacher-soft-panel p-5">
          <div className="flex items-start gap-3">
            <Boxes aria-hidden="true" className="mt-1 h-5 w-5 text-sky-700" />
            <div>
              <h2 className="text-base font-bold text-sky-950">
                Creating from {selectedBank.name}
              </h2>
              <p className="mt-1 text-sm leading-6 text-sky-900">
                The new Blueprint will be linked to this Library as a planning
                asset. It still cannot go directly to students.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <form action={createTeacherBlueprint} className="teacher-panel overflow-hidden">
        <div className="border-b border-slate-200 bg-white/70 p-5">
          <h2 className="text-xl font-bold text-slate-950">Blueprint details</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Keep this as a planning asset. Generation, Review Draft creation,
            and public submission remain separate gated workflows.
          </p>
        </div>

        <div className="grid gap-5 p-5">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Title
            <input
              className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950"
              maxLength={160}
              name="title"
              placeholder="Applications of Integration FRQ pattern"
              required
            />
          </label>

          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Description
            <textarea
              className="min-h-32 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
              maxLength={2000}
              name="description"
              placeholder="Describe the reusable structure, source evidence, or planning notes."
            />
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Visibility
              <select
                className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950"
                defaultValue="private"
                name="visibility"
              >
                <option value="private">Private</option>
                <option value="shared">Shared</option>
                <option value="organization">Organization</option>
                <option value="public">Public review</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Folder
              <select
                className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950"
                name="folderId"
              >
                <option value="">Unfiled</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Source Library
            <select
              className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950"
              defaultValue={selectedBank?.id ?? ""}
              name="sourceBankId"
            >
                <option value="">No Library link</option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
            </select>
          </label>
          </div>

          {selectedBank ? (
            <section className="rounded-lg border border-slate-200 bg-white/80">
              <div className="border-b border-slate-200 bg-slate-50/80 p-4">
                <h3 className="text-base font-bold text-slate-950">
                  Select source/example questions
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Only active approved questions from this Library are shown. The
                  Blueprint stores lineage and planning structure; it does not
                  modify the source questions.
                </p>
              </div>
              <div className="grid gap-3 p-4">
                {sourceQuestions.length ? (
                  sourceQuestions.map((row, index) => (
                    <label
                      className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-sky-200 hover:bg-sky-50/60"
                      key={row.bank_question_id}
                    >
                      <input
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600"
                        defaultChecked={index < 6}
                        name="sourceBankQuestionIds"
                        type="checkbox"
                        value={row.bank_question_id}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-slate-950">
                          {row.question?.title ?? "Untitled source question"}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                            {row.question?.question_type ?? "type"}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
                            Difficulty {row.question?.difficulty_rating ?? "not set"}
                          </span>
                          <span className="rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-sky-800">
                            {row.tagSummaries.length} taxonomy target{row.tagSummaries.length === 1 ? "" : "s"}
                          </span>
                        </span>
                      </span>
                    </label>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                    No active approved source questions are ready in this Library
                    yet. Approve Review Drafts into the bank before building a
                    Blueprint from bank examples.
                  </div>
                )}
              </div>
            </section>
          ) : null}

          <section className="rounded-lg border border-slate-200 bg-white/80 p-4">
            <h3 className="text-base font-bold text-slate-950">
              Planning structure
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Expected question count
                <input
                  className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950"
                  min={1}
                  name="expectedQuestionCount"
                  placeholder="8"
                  type="number"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700 md:col-span-2">
                Question type mix
                <input
                  className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950"
                  name="questionTypeMix"
                  placeholder={selectedQuestionTypes.length ? selectedQuestionTypes.join(", ") : "MCQ 60%, FRQ 40%"}
                />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Difficulty mix
                <textarea
                  className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="difficultyMix"
                  placeholder="Mostly medium with one transfer problem."
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Required elements
                <textarea
                  className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="requiredElements"
                  placeholder="One source-grounded setup per line"
                  required={Boolean(selectedBank)}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Answer pattern
                <textarea
                  className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="answerPattern"
                  placeholder="What a correct response should contain."
                  required={Boolean(selectedBank)}
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Distractor pattern
                <textarea
                  className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="distractorPattern"
                  placeholder="For MCQ, describe plausible incorrect choices."
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Originality / variation constraints
                <textarea
                  className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="originalityConstraints"
                  placeholder="Keep the same assessment structure without reusing source wording."
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Teacher notes
                <textarea
                  className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
                  name="teacherNotes"
                  placeholder="Planning notes for future review or generation."
                />
              </label>
            </div>
          </section>

          <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 text-sm leading-6 text-sky-950">
            Blueprint output must flow through Review Drafts and Library approval
            before assignment. This form only creates the Library asset.
          </div>

          <div className="flex flex-wrap gap-2">
            <FormSubmitButton pendingLabel="Creating Blueprint...">
              Create Blueprint
            </FormSubmitButton>
            <Button asChild variant="outline">
              <Link href="/teacher/blueprints">Cancel</Link>
            </Button>
          </div>
        </div>
      </form>
    </TeacherWorkspaceShell>
  );
}
