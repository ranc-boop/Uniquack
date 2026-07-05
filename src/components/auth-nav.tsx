import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function AuthNav() {
  if (!isSupabaseConfigured()) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/auth/login">Sign in</Link>
      </Button>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/auth/login">Sign in</Link>
      </Button>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, role")
    .eq("id", user.id)
    .maybeSingle();
  const teacherLabel =
    profile?.role === "teacher" ? "Teacher Studio" : "Teacher Studio preview";
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
          {profile?.username ?? user.email}
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
