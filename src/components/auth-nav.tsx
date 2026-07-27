import Link from "next/link";

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
  const teacherLabel =
    profile?.role === "teacher" ? "Teacher Workspace" : "Teacher Workspace preview";
  const canOpenTeacherStudio =
    profile?.role === "teacher" ||
    profile?.role === "admin" ||
    profile?.role === "super_admin";

  return (
    <div className="flex items-center gap-2">
      {canOpenTeacherStudio ? (
        <Button asChild variant="outline" size="sm">
          <Link href="/teacher">{teacherLabel}</Link>
        </Button>
      ) : null}
      <div className="hidden items-center gap-2 sm:flex">
        <span className="text-sm text-muted-foreground">
          {profile?.username ?? email}
        </span>
        {profile?.role ? <Badge variant="secondary">{profile.role}</Badge> : null}
      </div>
      <form action={signOut}>
        <Button type="submit" variant="outline" size="sm">
          Sign out
        </Button>
      </form>
    </div>
  );
}
