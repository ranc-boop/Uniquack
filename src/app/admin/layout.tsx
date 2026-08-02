import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <AdminShell>
      {children}
    </AdminShell>
  );
}
