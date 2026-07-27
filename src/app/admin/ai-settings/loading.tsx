import { AdminRouteLoading } from "@/components/admin/admin-route-loading";

export default function AdminAISettingsLoading() {
  return (
    <AdminRouteLoading
      description="Loading provider profiles, routing policy, and operational controls."
      title="AI Settings"
      variant="form"
    />
  );
}
