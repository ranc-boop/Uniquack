import { AdminPendingLink } from "@/components/admin/admin-pending-link";
import { canManageUsers } from "@/lib/auth/roles";
import type { UserRole } from "@/types/database";

const items = [
  { governance: false, href: "/admin/questions", label: "Questions" },
  { governance: false, href: "/admin/review", label: "Global Review Drafts" },
  { governance: true, href: "/admin/questions/submissions", label: "Public Submissions" },
  { governance: true, href: "/admin/questions/banks", label: "Bank Governance" },
  { governance: false, href: "/admin/imports", label: "Import" },
];

export function AdminQuestionLibraryNav({ role }: { role: UserRole }) {
  const canGovernPublic = canManageUsers(role);

  return (
    <nav
      aria-label="Central Public Library sections"
      className="flex gap-2 overflow-x-auto rounded-lg border bg-white p-2 shadow-sm"
    >
      {items.filter((item) => !item.governance || canGovernPublic).map((item) => (
        <AdminPendingLink
          className="min-h-10 shrink-0 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          href={item.href}
          key={item.href}
          pendingLabel={item.label}
        >
          {item.label}
        </AdminPendingLink>
      ))}
    </nav>
  );
}
