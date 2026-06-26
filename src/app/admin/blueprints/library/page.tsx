import {
  BlueprintWorkspace,
  type BlueprintWorkspaceProps,
} from "@/components/blueprints/blueprint-workspace";

export default async function AdminBlueprintsLibraryPage({
  searchParams,
}: Pick<BlueprintWorkspaceProps, "searchParams">) {
  return <BlueprintWorkspace searchParams={searchParams} view="library" />;
}
