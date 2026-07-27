import { AdminRouteLoading } from "@/components/admin/admin-route-loading";

export default function AdminAssetImportLoading() {
  return (
    <AdminRouteLoading
      description="Loading the question source inventory and bulk asset matcher."
      libraryNav
      title="Bulk asset upload"
      variant="form"
    />
  );
}
