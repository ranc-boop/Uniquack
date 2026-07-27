import { AdminRouteLoading } from "@/components/admin/admin-route-loading";

export default function AdminBankGovernanceLoading() {
  return (
    <AdminRouteLoading
      description="Loading public Library governance inventory and review controls."
      libraryNav
      title="Bank Governance"
      variant="table"
    />
  );
}
