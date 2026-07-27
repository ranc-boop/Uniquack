import { AdminRouteLoading } from "@/components/admin/admin-route-loading";

export default function AdminPackageImportLoading() {
  return (
    <AdminRouteLoading
      description="Loading package validation, preview, and Review Draft import controls."
      libraryNav
      title="Package import"
      variant="form"
    />
  );
}
