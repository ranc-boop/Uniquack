import { AdminRouteLoading } from "@/components/admin/admin-route-loading";

export default function AdminVideosLoading() {
  return (
    <AdminRouteLoading
      description="Loading the video catalog, filters, and editing controls."
      title="Videos"
      variant="table"
    />
  );
}
