import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  buildQuestionBlueprintFolderTree,
  type QuestionBlueprintFolderTreeNode,
} from "@/lib/blueprints/question-blueprint-folders";
import type {
  BankBlueprint,
  QuestionBank,
  QuestionBlueprint,
  QuestionBlueprintFolder,
  QuestionBlueprintKind,
  QuestionBlueprintStatus,
  QuestionBlueprintVisibility,
} from "@/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type TeacherBlueprintFilter =
  | "all"
  | "private"
  | "shared"
  | "organization"
  | "public"
  | "bank-linked"
  | "recent";

export type TeacherBlueprintLibraryItem = QuestionBlueprint & {
  folder: QuestionBlueprintFolder | null;
  linkedBanks: QuestionBank[];
  sourceBank: QuestionBank | null;
};

type TeacherBankBlueprintLink = BankBlueprint & {
  blueprint: TeacherBlueprintLibraryItem | null;
};

export type TeacherBlueprintLibrary = {
  bankLinkCount: number;
  blueprints: TeacherBlueprintLibraryItem[];
  folderTree: QuestionBlueprintFolderTreeNode[];
  folders: QuestionBlueprintFolder[];
  counts: Record<TeacherBlueprintFilter, number>;
};

const BLUEPRINT_SELECT =
  "id, organization_id, owner_scope, owner_id, folder_id, status, title, description, taxonomy_targets, question_pattern, required_elements, answer_spec_pattern, distractor_pattern, difficulty_profile, generation_constraints, originality_constraints, source_refs, generation_ready, generation_readiness, generation_blocking_reasons, calibration_status, last_calibrated_at, last_calibration_run_id, version, created_by, updated_by, approved_by, approved_at, created_at, updated_at, deleted_at, visibility, blueprint_kind, source_bank_id, source_kind, source_record_id, metadata";

const FOLDER_SELECT =
  "id, owner_scope, owner_id, parent_id, name, slug, description, sort_order, created_by, updated_by, created_at, updated_at, deleted_at, organization_id, visibility, status";

const BANK_SELECT =
  "id, organization_id, owner_id, name, description, visibility, status, metadata, created_by, updated_by, created_at, updated_at";

export class BlueprintLibrarySchemaMissingError extends Error {
  constructor(message = "Blueprint Library tables are not available yet.") {
    super(message);
    this.name = "BlueprintLibrarySchemaMissingError";
  }
}

function isMissingBlueprintSchemaError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    error?.code === "42703" ||
    error?.code === "42P01" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    message.includes("bank_blueprints") ||
    message.includes("blueprint_kind") ||
    message.includes("source_bank_id") ||
    message.includes("question_blueprints") ||
    message.includes("question_blueprint_folders") ||
    message.includes("schema cache")
  );
}

function assertBlueprintLibrarySchema(error: { code?: string; message?: string } | null) {
  if (isMissingBlueprintSchemaError(error)) {
    throw new BlueprintLibrarySchemaMissingError();
  }
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

async function listVisibleBankLinks({
  blueprintIds,
  supabase,
}: {
  blueprintIds?: string[];
  supabase: SupabaseServerClient;
}) {
  let query = supabase
    .from("bank_blueprints")
    .select("id, bank_id, blueprint_id, relation_kind, status, added_by, added_at, metadata")
    .eq("status", "active")
    .order("added_at", { ascending: false });

  if (blueprintIds?.length) {
    query = query.in("blueprint_id", blueprintIds);
  }

  const { data, error } = await query;
  assertBlueprintLibrarySchema(error);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as BankBlueprint[];
}

async function listBanksById({
  bankIds,
  supabase,
}: {
  bankIds: string[];
  supabase: SupabaseServerClient;
}) {
  if (!bankIds.length) {
    return new Map<string, QuestionBank>();
  }

  const { data, error } = await supabase
    .from("question_banks")
    .select(BANK_SELECT)
    .in("id", bankIds);

  assertBlueprintLibrarySchema(error);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((bank) => [bank.id, bank as QuestionBank]));
}

function buildLibraryItems({
  bankById,
  blueprints,
  folders,
  links,
}: {
  bankById: Map<string, QuestionBank>;
  blueprints: QuestionBlueprint[];
  folders: QuestionBlueprintFolder[];
  links: BankBlueprint[];
}) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const linksByBlueprintId = new Map<string, BankBlueprint[]>();

  for (const link of links) {
    linksByBlueprintId.set(link.blueprint_id, [
      ...(linksByBlueprintId.get(link.blueprint_id) ?? []),
      link,
    ]);
  }

  return blueprints.map((blueprint) => ({
    ...blueprint,
    folder: blueprint.folder_id ? folderById.get(blueprint.folder_id) ?? null : null,
    linkedBanks: (linksByBlueprintId.get(blueprint.id) ?? [])
      .map((link) => bankById.get(link.bank_id))
      .filter((bank): bank is QuestionBank => Boolean(bank)),
    sourceBank: blueprint.source_bank_id
      ? bankById.get(blueprint.source_bank_id) ?? null
      : null,
  }));
}

function countBlueprints(items: TeacherBlueprintLibraryItem[]) {
  const counts: Record<TeacherBlueprintFilter, number> = {
    all: items.length,
    "bank-linked": items.filter(
      (item) => item.source_bank_id || item.linkedBanks.length,
    ).length,
    organization: items.filter((item) => item.visibility === "organization").length,
    private: items.filter((item) => item.visibility === "private").length,
    public: items.filter((item) => item.visibility === "public").length,
    recent: items.length,
    shared: items.filter((item) => item.visibility === "shared").length,
  };

  return counts;
}

function applyFilter(
  items: TeacherBlueprintLibraryItem[],
  filter: TeacherBlueprintFilter,
) {
  if (filter === "all" || filter === "recent") {
    return items;
  }

  if (filter === "bank-linked") {
    return items.filter((item) => item.source_bank_id || item.linkedBanks.length);
  }

  return items.filter((item) => item.visibility === filter);
}

export async function listTeacherBlueprintLibrary({
  filter = "all",
  supabase,
}: {
  filter?: TeacherBlueprintFilter;
  supabase: SupabaseServerClient;
}): Promise<TeacherBlueprintLibrary> {
  const { data: folders, error: folderError } = await supabase
    .from("question_blueprint_folders")
    .select(FOLDER_SELECT)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  assertBlueprintLibrarySchema(folderError);

  if (folderError) {
    throw new Error(folderError.message);
  }

  const { data: blueprints, error: blueprintError } = await supabase
    .from("question_blueprints")
    .select(BLUEPRINT_SELECT)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(100);
  assertBlueprintLibrarySchema(blueprintError);

  if (blueprintError) {
    throw new Error(blueprintError.message);
  }

  const blueprintRows = (blueprints ?? []) as QuestionBlueprint[];
  const links = await listVisibleBankLinks({
    blueprintIds: blueprintRows.map((blueprint) => blueprint.id),
    supabase,
  });
  const bankById = await listBanksById({
    bankIds: unique([
      ...blueprintRows.map((blueprint) => blueprint.source_bank_id),
      ...links.map((link) => link.bank_id),
    ]),
    supabase,
  });
  const items = buildLibraryItems({
    bankById,
    blueprints: blueprintRows,
    folders: (folders ?? []) as QuestionBlueprintFolder[],
    links,
  });
  const counts = countBlueprints(items);
  const filteredItems = applyFilter(items, filter);

  return {
    bankLinkCount: counts["bank-linked"],
    blueprints: filteredItems,
    counts,
    folders: (folders ?? []) as QuestionBlueprintFolder[],
    folderTree: buildQuestionBlueprintFolderTree(
      (folders ?? []).map((folder) => ({
        ...folder,
        owner_scope: folder.owner_scope as QuestionBlueprintFolder["owner_scope"],
      })),
    ),
  };
}

export async function getTeacherBlueprintDetail({
  blueprintId,
  supabase,
}: {
  blueprintId: string;
  supabase: SupabaseServerClient;
}) {
  const { data: blueprint, error } = await supabase
    .from("question_blueprints")
    .select(BLUEPRINT_SELECT)
    .eq("id", blueprintId)
    .maybeSingle();
  assertBlueprintLibrarySchema(error);

  if (error) {
    throw new Error(error.message);
  }

  if (!blueprint) {
    return null;
  }

  const [foldersResult, links] = await Promise.all([
    supabase
      .from("question_blueprint_folders")
      .select(FOLDER_SELECT)
      .is("deleted_at", null),
    listVisibleBankLinks({ blueprintIds: [blueprint.id], supabase }),
  ]);
  assertBlueprintLibrarySchema(foldersResult.error);

  if (foldersResult.error) {
    throw new Error(foldersResult.error.message);
  }

  const bankById = await listBanksById({
    bankIds: unique([blueprint.source_bank_id, ...links.map((link) => link.bank_id)]),
    supabase,
  });
  const [item] = buildLibraryItems({
    bankById,
    blueprints: [blueprint as QuestionBlueprint],
    folders: (foldersResult.data ?? []) as QuestionBlueprintFolder[],
    links,
  });

  return {
    blueprint: item,
    bankLinks: links.map((link) => ({
      ...link,
      bank: bankById.get(link.bank_id) ?? null,
    })),
  };
}

export async function listBankLinkedBlueprints({
  bankId,
  supabase,
}: {
  bankId: string;
  supabase: SupabaseServerClient;
}) {
  const { data: links, error } = await supabase
    .from("bank_blueprints")
    .select("id, bank_id, blueprint_id, relation_kind, status, added_by, added_at, metadata")
    .eq("bank_id", bankId)
    .eq("status", "active")
    .order("added_at", { ascending: false });
  assertBlueprintLibrarySchema(error);

  if (error) {
    throw new Error(error.message);
  }

  const blueprintIds = (links ?? []).map((link) => link.blueprint_id);
  if (!blueprintIds.length) {
    return [];
  }

  const [{ data: blueprints, error: blueprintError }, { data: folders, error: folderError }] =
    await Promise.all([
      supabase
        .from("question_blueprints")
        .select(BLUEPRINT_SELECT)
        .in("id", blueprintIds)
        .is("deleted_at", null),
      supabase
        .from("question_blueprint_folders")
        .select(FOLDER_SELECT)
        .is("deleted_at", null),
    ]);
  assertBlueprintLibrarySchema(blueprintError);
  assertBlueprintLibrarySchema(folderError);

  if (blueprintError) {
    throw new Error(blueprintError.message);
  }

  if (folderError) {
    throw new Error(folderError.message);
  }

  const bankById = await listBanksById({ bankIds: [bankId], supabase });
  const items = buildLibraryItems({
    bankById,
    blueprints: (blueprints ?? []) as QuestionBlueprint[],
    folders: (folders ?? []) as QuestionBlueprintFolder[],
    links: links as BankBlueprint[],
  });
  const itemById = new Map(items.map((item) => [item.id, item]));

  return (links ?? []).map((link) => ({
    ...(link as BankBlueprint),
    blueprint: itemById.get(link.blueprint_id) ?? null,
  })) satisfies TeacherBankBlueprintLink[];
}

export function normalizeTeacherBlueprintFilter(
  value: string | null | undefined,
): TeacherBlueprintFilter {
  const filters: TeacherBlueprintFilter[] = [
    "all",
    "private",
    "shared",
    "organization",
    "public",
    "bank-linked",
    "recent",
  ];

  return filters.includes(value as TeacherBlueprintFilter)
    ? (value as TeacherBlueprintFilter)
    : "all";
}

export function blueprintVisibilityLabel(visibility: QuestionBlueprintVisibility) {
  const labels: Record<QuestionBlueprintVisibility, string> = {
    organization: "Organization",
    private: "Private",
    public: "Public review",
    shared: "Shared",
  };

  return labels[visibility];
}

export function blueprintKindLabel(kind: QuestionBlueprintKind) {
  const labels: Record<QuestionBlueprintKind, string> = {
    bank_generated: "Library-generated",
    course_builder: "Course Builder",
    imported: "Imported",
    manual: "Manual",
  };

  return labels[kind];
}

export function blueprintStatusLabel(status: QuestionBlueprintStatus) {
  const labels: Record<QuestionBlueprintStatus, string> = {
    approved: "Approved",
    archived: "Archived",
    deprecated: "Deprecated",
    needs_more_evidence: "Needs evidence",
    pending_review: "Draft",
    rejected: "Rejected",
    trashed: "Trash",
  };

  return labels[status];
}

export function bankBlueprintRelationLabel(relationKind: BankBlueprint["relation_kind"]) {
  const labels: Record<BankBlueprint["relation_kind"], string> = {
    generated_from_bank: "Generated from Library",
    imported_to_bank: "Imported to Library",
    linked: "Linked",
  };

  return labels[relationKind];
}

export function summarizeBlueprintTaxonomy(value: unknown) {
  if (!Array.isArray(value) || !value.length) {
    return "No taxonomy targets yet";
  }

  const labels = value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const candidate = item as { label?: unknown; tagId?: unknown; tag_id?: unknown };
        return typeof candidate.label === "string"
          ? candidate.label
          : typeof candidate.tagId === "string"
            ? candidate.tagId
            : typeof candidate.tag_id === "string"
              ? candidate.tag_id
              : null;
      }
      return null;
    })
    .filter((label): label is string => Boolean(label))
    .slice(0, 4);

  if (!labels.length) {
    return `${value.length} taxonomy target${value.length === 1 ? "" : "s"}`;
  }

  return labels.join(", ");
}

