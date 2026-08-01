import Link from "next/link";
import { ChevronDown, UserRound } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentAuthContext } from "@/lib/auth/guards";

export async function AuthNav() {
  const authContext = await getCurrentAuthContext();

  if (!authContext) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/auth/login">Sign in</Link>
      </Button>
    );
  }

  const { email, profile } = authContext;

  return (
    <details className="group relative shrink-0">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2">
        <UserRound aria-hidden="true" className="h-4 w-4" />
        <span className="hidden max-w-36 truncate lg:inline">
          {profile?.username ?? email}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="collapsible-chevron h-4 w-4 text-slate-500"
        />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
        <div className="min-w-0 border-b border-slate-200 pb-3">
          <p className="truncate text-sm font-semibold text-slate-950">
            {profile?.username ?? email}
          </p>
          {profile?.role ? (
            <Badge className="mt-2" variant="secondary">
              {profile.role}
            </Badge>
          ) : null}
        </div>
        <form action={signOut} className="pt-3">
          <Button className="w-full" type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
      </div>
      {/* "Teacher Workspace preview" was removed because the primary navigation
          already exposes the Teacher workspace to authorized roles. */}
    </details>
  );
}
