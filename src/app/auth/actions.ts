"use server";

import { redirect } from "next/navigation";

import { canAccessAdmin } from "@/lib/auth/roles";
import { usernameToLocalEmail } from "@/lib/auth/username";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return null;
  }

  if (value.startsWith("//")) {
    return null;
  }

  return value;
}

export async function signInWithUsername(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/auth/login?error=environment_not_configured");
  }

  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));
  const email = usernameToLocalEmail(username);

  if (!email || !password) {
    redirect("/auth/login?error=credentials_required");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/auth/login?error=invalid_credentials");
  }

  if (next) {
    redirect(next);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (canAccessAdmin(profile?.role)) {
    redirect("/admin");
  }

  if (profile?.role === "teacher") {
    redirect("/teacher");
  }

  redirect("/questions");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  redirect("/auth/login");
}
