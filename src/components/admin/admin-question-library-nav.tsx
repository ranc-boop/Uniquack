import Link from "next/link";

import { getCurrentProfile } from "@/lib/auth/guards";
import { canManageUsers } from "@/lib/auth/roles";

const items = [
  { governance: false, href: "/admin/questions", label: "Questions" },
  { governance: false, href: "/admin/review", label: "Global Review Drafts" },
  { governance: true, href: "/admin/questions/submissions", label: "Public Submissions" },
  { governance: true, href: "/admin/questions/banks", label: "Bank Governance" },
  { governance: false, href: "/admin/imports", label: "Import" },
];

export async function AdminQuestionLibraryNav() {
  const profile = await getCurrentProfile();
  const canGovernPublic = Boolean(profile && canManageUsers(profile.role));

  return (
    <nav
      aria-label="Central Public Library sections"
      className="flex gap-2 overflow-x-auto rounded-lg border bg-white p-2 shadow-sm"
    >
      {items.filter((item) => !item.governance || canGovernPublic).map((item) => (
        <Link
          className="min-h-10 shrink-0 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          href={item.href}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
