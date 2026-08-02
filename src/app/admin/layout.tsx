import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdmin();

  return (
    <AdminShell
      role={profile.role}
      username={profile.username}
    >
      {children}
    </AdminShell>
  );
}
