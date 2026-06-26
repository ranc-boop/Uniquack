import {
  BlueprintWorkspace,
  type BlueprintWorkspaceProps,
} from "@/components/blueprints/blueprint-workspace";

export default async function AdminBlueprintsSourcesPage({
  searchParams,
}: Pick<BlueprintWorkspaceProps, "searchParams">) {
  return <BlueprintWorkspace searchParams={searchParams} view="sources" />;
}
