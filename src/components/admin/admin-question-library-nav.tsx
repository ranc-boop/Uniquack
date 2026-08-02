import { AdminPendingLink } from "@/components/admin/admin-pending-link";
import { canManageUsers } from "@/lib/auth/roles";
import type { UserRole } from "@/types/database";

const items = [
  { governance: false, href: "/admin/questions", label: "Public Library" },
  { governance: false, href: "/admin/review", label: "Approval Queue" },
  { governance: true, href: "/admin/questions/submissions", label: "Submission History" },
  { governance: true, href: "/admin/questions/banks", label: "Library Support" },
];

export function AdminQuestionLibraryNav({ role }: { role: UserRole }) {
  const canGovernPublic = canManageUsers(role);

  return (
    <nav
      aria-label="Content governance sections"
      className="flex gap-1 overflow-x-auto rounded-[14px] border border-[#D2D2D7] bg-white p-1.5"
    >
      {items.filter((item) => !item.governance || canGovernPublic).map((item) => (
        <AdminPendingLink
          className="min-h-11 shrink-0 rounded-[10px] px-3 py-2 text-sm font-medium text-[#6E6E73] transition-colors duration-200 hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
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
