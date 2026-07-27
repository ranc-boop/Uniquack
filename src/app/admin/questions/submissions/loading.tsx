import { AdminRouteLoading } from "@/components/admin/admin-route-loading";

export default function AdminPublicSubmissionsLoading() {
  return (
    <AdminRouteLoading
      description="Loading immutable submission snapshots, evidence, and decision controls."
      libraryNav
      title="Public Submissions"
      variant="table"
    />
  );
}
