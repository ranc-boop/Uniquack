import {
  BlueprintWorkspace,
  type BlueprintWorkspaceProps,
} from "@/components/blueprints/blueprint-workspace";

export default async function AdminBlueprintsReviewPage({
  searchParams,
}: Pick<BlueprintWorkspaceProps, "searchParams">) {
  return <BlueprintWorkspace searchParams={searchParams} view="review" />;
}
