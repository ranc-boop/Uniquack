import { updateUserRole } from "@/app/admin/users/actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export default async function AdminUsersPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, email, full_name, role")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Settings"
        help="Manage admin, teacher, and student role assignments. Password reset and account disabling remain outside this route."
        helpLabel="Users admin details"
        title="Users"
      />
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-[260px]">Update role</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(profiles ?? []).map((profile) => (
              <TableRow key={profile.id}>
                <TableCell>{profile.username}</TableCell>
                <TableCell>{profile.email ?? "-"}</TableCell>
                <TableCell>{profile.full_name ?? "-"}</TableCell>
                <TableCell>
                  <AdminStatusBadge status={profile.role} />
                </TableCell>
                <TableCell>
                  <form action={updateUserRole} className="flex gap-2">
                    <input type="hidden" name="id" value={profile.id} />
                    <select
                      name="role"
                      defaultValue={profile.role}
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super admin</option>
                    </select>
                    <Button type="submit" size="sm">
                      Save
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
