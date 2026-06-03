import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/review", label: "Review Drafts" },
  { href: "/admin/questions", label: "Questions" },
  { href: "/admin/tags", label: "Tags" },
  { href: "/admin/videos", label: "Videos" },
  { href: "/admin/imports", label: "Imports" },
  { href: "/admin/users", label: "Users" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdmin();

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside className="space-y-4 border-r pr-4">
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">{profile.username}</p>
          <Badge variant="secondary">{profile.role}</Badge>
        </div>
        <nav className="grid gap-1">
          {navItems
            .filter(
              (item) => item.href !== "/admin/users" || profile.role === "super_admin",
            )
            .map((item) => (
              <Button
                key={item.href}
                asChild
                variant="ghost"
                className="justify-start"
              >
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
        </nav>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out
          </Button>
        </form>
      </aside>
      <section>{children}</section>
    </div>
  );
}
