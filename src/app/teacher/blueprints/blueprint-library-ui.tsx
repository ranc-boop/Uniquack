import Link from "next/link";
import type React from "react";

import {
  ArrowRight,
  Boxes,
  FolderOpen,
  Library,
  Lock,
  Network,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormSubmitButton } from "@/components/form-submit-button";
import {
  bankBlueprintRelationLabel,
  blueprintKindLabel,
  blueprintStatusLabel,
  blueprintVisibilityLabel,
  summarizeBlueprintTaxonomy,
  type TeacherBlueprintFilter,
  type TeacherBlueprintLibraryItem,
} from "@/lib/teacher-blueprints";
import { readinessWarnings, sourceExampleCount } from "@/lib/teacher-blueprint-builder";
import type { QuestionBlueprintFolderTreeNode } from "@/lib/blueprints/question-blueprint-folders";

const visibilityTone: Record<string, string> = {
  organization: "border-indigo-200 bg-indigo-50 text-indigo-800",
  private: "border-slate-200 bg-white text-slate-700",
  public: "border-sky-200 bg-sky-50 text-sky-800",
  shared: "border-blue-200 bg-blue-50 text-blue-800",
};

const statusTone: Record<string, string> = {
  approved: "border-cyan-200 bg-cyan-50 text-cyan-800",
  archived: "border-slate-200 bg-slate-50 text-slate-600",
  deprecated: "border-slate-200 bg-slate-50 text-slate-600",
  needs_more_evidence: "border-amber-200 bg-amber-50 text-amber-800",
  pending_review: "border-blue-200 bg-blue-50 text-blue-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-800",
  trashed: "border-slate-200 bg-slate-50 text-slate-600",
};

export function BlueprintBadge({
  children,
  className = "border-slate-200 bg-white text-slate-700",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}
    >
      {children}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) return "Not yet";

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function SetupNeededState() {
  return (
    <section className="teacher-panel p-6">
      <p className="teacher-eyebrow">Setup needed</p>
      <h2 className="mt-2 text-2xl font-bold text-slate-950">
        Blueprint Library fields are not available yet.
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
        Apply clean migration 0031 before using the teacher Blueprint Library.
        The admin Blueprint Engine remains untouched; this teacher library adds
        ownership, visibility, folders, and bank links.
      </p>
    </section>
  );
}

export function BlueprintSafetyStrip() {
  return (
    <section className="grid gap-2 md:grid-cols-3">
      {[
        "Blueprints organize reusable planning assets.",
        "Blueprint output must pass through Review Drafts.",
        "Nothing goes directly to students from this library.",
      ].map((note) => (
        <div
          className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-sm font-semibold leading-6 text-sky-950"
          key={note}
        >
          {note}
        </div>
      ))}
    </section>
  );
}

export function BlueprintFilterTabs({
  activeFilter,
  counts,
}: {
  activeFilter: TeacherBlueprintFilter;
  counts: Record<TeacherBlueprintFilter, number>;
}) {
  const filters: Array<{ href: string; key: TeacherBlueprintFilter; label: string }> = [
    { href: "/teacher/blueprints", key: "all", label: "All" },
    { href: "/teacher/blueprints?filter=private", key: "private", label: "Private" },
    { href: "/teacher/blueprints?filter=shared", key: "shared", label: "Shared" },
    {
      href: "/teacher/blueprints?filter=organization",
      key: "organization",
      label: "Organization",
    },
    { href: "/teacher/blueprints?filter=public", key: "public", label: "Public" },
    {
      href: "/teacher/blueprints?filter=bank-linked",
      key: "bank-linked",
      label: "Library-linked",
    },
    { href: "/teacher/blueprints?filter=recent", key: "recent", label: "Recently Updated" },
  ];

  return (
    <nav
      aria-label="Blueprint filters"
      className="flex gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white/85 p-2 shadow-sm"
    >
      {filters.map((filter) => (
        <Link
          aria-current={filter.key === activeFilter ? "true" : undefined}
          className={[
            "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
            filter.key === activeFilter
              ? "bg-sky-600 text-white"
              : "text-slate-600 hover:bg-sky-50 hover:text-sky-800",
          ].join(" ")}
          href={filter.href}
          key={filter.key}
        >
          {filter.label}
          <span
            className={[
              "rounded-full px-2 py-0.5 text-xs",
              filter.key === activeFilter ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600",
            ].join(" ")}
          >
            {counts[filter.key]}
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function BlueprintFolderPanel({
  folderTree,
}: {
  folderTree: QuestionBlueprintFolderTreeNode[];
}) {
  return (
    <aside className="teacher-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="teacher-eyebrow">Folders</p>
          <h2 className="text-lg font-bold text-slate-950">Library shelves</h2>
        </div>
        <FolderOpen aria-hidden="true" className="h-5 w-5 text-sky-700" />
      </div>

      <div className="mt-4 space-y-2">
        <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-3 py-2 text-sm font-semibold text-sky-950">
          All Blueprints
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          Unfiled
        </div>
        {folderTree.length ? (
          folderTree.map((folder) => (
            <div
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              key={folder.id}
              style={{ marginLeft: `${Math.min(folder.depth, 4) * 12}px` }}
            >
              <span className="font-semibold">{folder.name}</span>
              {folder.description ? (
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                  {folder.description}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-600">
            No folders yet. Use New Folder to organize reusable patterns.
          </p>
        )}
      </div>
    </aside>
  );
}

export function NewFolderPanel() {
  return (
    <details className="teacher-panel p-5" id="new-folder">
      <summary className="cursor-pointer text-sm font-bold text-slate-950">
        New Folder
      </summary>
      <form action={async (formData) => {
        "use server";
        const { createTeacherBlueprintFolder } = await import("./actions");
        await createTeacherBlueprintFolder(formData);
      }} className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Folder name
          <input
            className="min-h-11 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-950"
            maxLength={120}
            name="name"
            required
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Description
          <textarea
            className="min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950"
            maxLength={500}
            name="description"
          />
        </label>
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
        <FormSubmitButton pendingLabel="Creating folder...">
          Create folder
        </FormSubmitButton>
      </form>
    </details>
  );
}

export function BlueprintCard({ blueprint }: { blueprint: TeacherBlueprintLibraryItem }) {
  return (
    <article className="teacher-card-hover teacher-panel flex h-full flex-col justify-between gap-5 p-5">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <BlueprintBadge className={visibilityTone[blueprint.visibility]}>
            {blueprintVisibilityLabel(blueprint.visibility)}
          </BlueprintBadge>
          <BlueprintBadge className={statusTone[blueprint.status]}>
            {blueprintStatusLabel(blueprint.status)}
          </BlueprintBadge>
          <BlueprintBadge>{blueprintKindLabel(blueprint.blueprint_kind)}</BlueprintBadge>
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-950">{blueprint.title}</h2>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
            {blueprint.description ||
              "Reusable planning asset for question structure, constraints, and source lineage."}
          </p>
        </div>
        <dl className="grid gap-2 text-sm">
          <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Taxonomy summary
            </dt>
            <dd className="mt-1 break-words font-medium text-slate-800">
              {summarizeBlueprintTaxonomy(blueprint.taxonomy_targets)}
            </dd>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Folder
              </dt>
              <dd className="mt-1 font-medium text-slate-800">
                {blueprint.folder?.name ?? "Unfiled"}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Source Library
              </dt>
              <dd className="mt-1 font-medium text-slate-800">
                {blueprint.sourceBank?.name ||
                  blueprint.linkedBanks[0]?.name ||
                "No Library link"}
              </dd>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Source examples
              </dt>
              <dd className="mt-1 font-medium text-slate-800">
                {sourceExampleCount(blueprint)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white/70 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Readiness
              </dt>
              <dd className="mt-1 font-medium text-slate-800">
                {readinessWarnings(blueprint).length ? "Needs planning" : "Preview ready"}
              </dd>
            </div>
          </div>
        </dl>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Updated {formatDate(blueprint.updated_at)}
        </p>
        <Button asChild variant="outline">
          <Link href={`/teacher/blueprints/${blueprint.id}`}>
            Open
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function BlueprintEmptyState() {
  return (
    <section className="teacher-panel p-8 text-center">
      <Library aria-hidden="true" className="mx-auto h-12 w-12 text-sky-700" />
      <p className="teacher-eyebrow mt-4">Blueprint Library</p>
      <h2 className="mt-2 text-2xl font-bold text-slate-950">
        No Blueprints yet.
      </h2>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
        Start with a private Blueprint, or generate one from a Library in a later
        step.
      </p>
      <Button asChild className="mt-5">
        <Link href="/teacher/blueprints/new">Create Blueprint</Link>
      </Button>
    </section>
  );
}

export function BlueprintWorkflowPanel() {
  return (
    <section className="teacher-soft-panel p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-bold text-sky-950">
            Blueprint workflow boundary
          </h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-sky-900">
            Blueprints do not go directly to students. Blueprint output flows
            through Review Drafts and banks before assignment.
          </p>
        </div>
        <div className="flex shrink-0 gap-2 text-sky-700">
          <Lock aria-hidden="true" className="h-5 w-5" />
          <Network aria-hidden="true" className="h-5 w-5" />
          <Boxes aria-hidden="true" className="h-5 w-5" />
        </div>
      </div>
    </section>
  );
}

export function DisabledBlueprintActions() {
  const actions = [
    "Link to Library",
    "Generate Review Drafts",
    "Use in Publish",
    "Share / Submit to Public Review",
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {actions.map((action) => (
        <Button disabled key={action} type="button" variant="outline">
          {action} - coming next
        </Button>
      ))}
    </div>
  );
}

export function BankLinkSummary({
  bankName,
  relationKind,
}: {
  bankName: string;
  relationKind: Parameters<typeof bankBlueprintRelationLabel>[0];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <BlueprintBadge className="border-blue-200 bg-blue-50 text-blue-800">
          {bankBlueprintRelationLabel(relationKind)}
        </BlueprintBadge>
        <span className="text-sm font-semibold text-slate-950">{bankName}</span>
      </div>
    </div>
  );
}

export function BlueprintDetailMetric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-1 break-words text-sm font-semibold text-slate-900">
        {value}
      </div>
    </div>
  );
}

export function BlueprintKindIcon() {
  return <Sparkles aria-hidden="true" className="h-5 w-5 text-sky-700" />;
}
