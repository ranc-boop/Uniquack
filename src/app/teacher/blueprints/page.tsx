import Link from "next/link";

import { FolderPlus, Plus } from "lucide-react";

import { TeacherWorkspaceShell } from "@/components/teacher/teacher-workspace-shell";
import { TeacherWorkspaceNav } from "@/components/teacher/teacher-workspace-nav";
import { Button } from "@/components/ui/button";
import { requireTeacher } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import {
  BlueprintLibrarySchemaMissingError,
  listTeacherBlueprintLibrary,
  normalizeTeacherBlueprintFilter,
} from "@/lib/teacher-blueprints";

import {
  BlueprintCard,
  BlueprintEmptyState,
  BlueprintFilterTabs,
  BlueprintFolderPanel,
  BlueprintSafetyStrip,
  BlueprintWorkflowPanel,
  NewFolderPanel,
  SetupNeededState,
} from "./blueprint-library-ui";

export const dynamic = "force-dynamic";

export default async function TeacherBlueprintsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; folderCreated?: string; folderError?: string }>;
}) {
  await requireTeacher();
  const query = await searchParams;
  const activeFilter = normalizeTeacherBlueprintFilter(query.filter);
  const supabase = await createClient();
  let library;

  try {
    library = await listTeacherBlueprintLibrary({
      filter: activeFilter,
      supabase,
    });
  } catch (error) {
    if (error instanceof BlueprintLibrarySchemaMissingError) {
      return (
        <TeacherWorkspaceShell
          title="Blueprint Library"
          description="Blueprints are reusable planning/package assets. They organize question patterns before Review Drafts and bank approval."
        >
          <TeacherWorkspaceNav />
          <SetupNeededState />
        </TeacherWorkspaceShell>
      );
    }

    throw error;
  }

  return (
    <TeacherWorkspaceShell
      actions={
        <>
          <Button asChild>
            <Link href="/teacher/blueprints/new">
              <Plus aria-hidden="true" className="h-4 w-4" />
              Create Blueprint
            </Link>
          </Button>
          <Button asChild variant="outline">
            <a href="#new-folder">
              <FolderPlus aria-hidden="true" className="h-4 w-4" />
              New Folder
            </a>
          </Button>
        </>
      }
      description="Blueprints are reusable planning/package assets. They organize question patterns before Review Drafts and bank approval."
      eyebrow="Teacher Blueprint workspace"
      title="Blueprint Library"
    >
      <TeacherWorkspaceNav />
      <BlueprintSafetyStrip />
      <BlueprintWorkflowPanel />

      {query.folderCreated ? (
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">
          Folder created.
        </div>
      ) : null}
      {query.folderError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Folder could not be created. Check the name and try again.
        </div>
      ) : null}

      <BlueprintFilterTabs activeFilter={activeFilter} counts={library.counts} />

      <section className="grid gap-4 xl:grid-cols-[0.35fr_1fr]">
        <div className="space-y-4">
          <BlueprintFolderPanel folderTree={library.folderTree} />
          <NewFolderPanel />
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Blueprints", library.counts.all],
              ["Bank-linked", library.bankLinkCount],
              ["Folders", library.folders.length],
            ].map(([label, value]) => (
              <div
                className="teacher-panel p-4"
                key={label}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
              </div>
            ))}
          </div>

          {library.blueprints.length ? (
            <section className="grid gap-4 lg:grid-cols-2">
              {library.blueprints.map((blueprint) => (
                <BlueprintCard blueprint={blueprint} key={blueprint.id} />
              ))}
            </section>
          ) : (
            <BlueprintEmptyState />
          )}
        </div>
      </section>
    </TeacherWorkspaceShell>
  );
}
