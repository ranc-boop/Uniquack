import Link from "next/link";

import { ArrowLeft, Boxes } from "lucide-react";

import { TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import {
  canManageBankContent,
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
  searchParams: Promise<{ sourceBankId?: string; error?: string }>;
}) {
  const profile = await requireTeacher();
  const query = await searchParams;
  const supabase = await createClient();

  let banks: Awaited<ReturnType<typeof listTeacherQuestionBanks>> = [];
  let folders: Awaited<ReturnType<typeof listTeacherBlueprintLibrary>>["folders"] = [];

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

  const selectedBank = banks.find((bank) => bank.id === query.sourceBankId) ?? null;

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
          Blueprint could not be created. Check the required fields and try
          again.
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
                The new Blueprint will be linked to this bank as a planning
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
              Source bank
              <select
                className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950"
                defaultValue={selectedBank?.id ?? ""}
                name="sourceBankId"
              >
                <option value="">No bank link</option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-sky-100 bg-sky-50/80 p-4 text-sm leading-6 text-sky-950">
            Blueprint output must flow through Review Drafts and bank approval
            before assignment. This form only creates the library asset.
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit">Create Blueprint</Button>
            <Button asChild variant="outline">
              <Link href="/teacher/blueprints">Cancel</Link>
            </Button>
          </div>
        </div>
      </form>
    </TeacherWorkspaceShell>
  );
}
