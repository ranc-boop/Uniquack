import { AdminRouteLoading } from "@/components/admin/admin-route-loading";

export default function AdminImportsLoading() {
  return (
    <AdminRouteLoading
      description="Loading import methods, recent activity, and Review Draft handoff."
      libraryNav
      title="Import Tools"
      variant="cards"
    />
  );
}
