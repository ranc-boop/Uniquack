import { AdminRouteLoading } from "@/components/admin/admin-route-loading";

export default function AdminUsersLoading() {
  return (
    <AdminRouteLoading
      description="Loading user accounts and role management controls."
      title="Users"
      variant="table"
    />
  );
}
