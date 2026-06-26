export type QuestionBlueprintFolderRow = {
  deleted_at?: string | null;
  description?: string | null;
  id: string;
  name: string;
  owner_id?: string | null;
  owner_scope: "system" | "school" | "teacher" | "private";
  parent_id?: string | null;
  slug: string;
  sort_order?: number | null;
};

export type QuestionBlueprintFolderTreeNode = QuestionBlueprintFolderRow & {
  children: QuestionBlueprintFolderTreeNode[];
  depth: number;
};

export type QuestionBlueprintFolderSummary = {
  activeFolderCount: number;
  archivedFolderCount: number;
  filedBlueprintCount: number;
  unfiledBlueprintCount: number;
};

export function normalizeQuestionBlueprintFolderName(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim().slice(0, 120)
    : "";
}

export function slugifyQuestionBlueprintFolderName(value: unknown) {
  const normalized = normalizeQuestionBlueprintFolderName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return normalized || "folder";
}

function folderSort(
  left: QuestionBlueprintFolderRow,
  right: QuestionBlueprintFolderRow,
) {
  const orderDelta = (left.sort_order ?? 0) - (right.sort_order ?? 0);

  return orderDelta || left.name.localeCompare(right.name);
}

export function buildQuestionBlueprintFolderTree(
  folders: QuestionBlueprintFolderRow[],
): QuestionBlueprintFolderTreeNode[] {
  const activeFolders = folders
    .filter((folder) => !folder.deleted_at)
    .sort(folderSort);
  const byId = new Map(activeFolders.map((folder) => [folder.id, folder]));
  const childrenByParent = new Map<string, QuestionBlueprintFolderRow[]>();
  const roots: QuestionBlueprintFolderRow[] = [];

  for (const folder of activeFolders) {
    const parentId = folder.parent_id ?? "";

    if (!parentId || !byId.has(parentId)) {
      roots.push(folder);
      continue;
    }

    childrenByParent.set(parentId, [
      ...(childrenByParent.get(parentId) ?? []),
      folder,
    ]);
  }

  function buildNode(
    folder: QuestionBlueprintFolderRow,
    depth: number,
    seen: Set<string>,
  ): QuestionBlueprintFolderTreeNode {
    if (seen.has(folder.id)) {
      return { ...folder, children: [], depth };
    }

    const nextSeen = new Set(seen);
    nextSeen.add(folder.id);

    return {
      ...folder,
      children: (childrenByParent.get(folder.id) ?? [])
        .sort(folderSort)
        .map((child) => buildNode(child, depth + 1, nextSeen)),
      depth,
    };
  }

  return roots.sort(folderSort).map((folder) => buildNode(folder, 0, new Set()));
}

export function flattenQuestionBlueprintFolderTree(
  nodes: QuestionBlueprintFolderTreeNode[],
): QuestionBlueprintFolderTreeNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenQuestionBlueprintFolderTree(node.children),
  ]);
}

export function wouldCreateQuestionBlueprintFolderCycle({
  folderId,
  folders,
  parentId,
}: {
  folderId: string;
  folders: Pick<QuestionBlueprintFolderRow, "id" | "parent_id">[];
  parentId?: string | null;
}) {
  if (!parentId) return false;
  if (folderId === parentId) return true;

  const byId = new Map(folders.map((folder) => [folder.id, folder.parent_id]));
  const seen = new Set<string>();
  let current: string | null | undefined = parentId;

  while (current) {
    if (current === folderId) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = byId.get(current);
  }

  return false;
}

export function summarizeQuestionBlueprintFolders({
  blueprints,
  folders,
}: {
  blueprints: Array<{ deleted_at?: string | null; folder_id?: string | null }>;
  folders: QuestionBlueprintFolderRow[];
}): QuestionBlueprintFolderSummary {
  const activeFolderIds = new Set(
    folders.filter((folder) => !folder.deleted_at).map((folder) => folder.id),
  );
  const activeBlueprints = blueprints.filter((blueprint) => !blueprint.deleted_at);
  const filedBlueprintCount = activeBlueprints.filter(
    (blueprint) => blueprint.folder_id && activeFolderIds.has(blueprint.folder_id),
  ).length;

  return {
    activeFolderCount: activeFolderIds.size,
    archivedFolderCount: folders.filter((folder) => folder.deleted_at).length,
    filedBlueprintCount,
    unfiledBlueprintCount: activeBlueprints.length - filedBlueprintCount,
  };
}
