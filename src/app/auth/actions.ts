"use server";

import { redirect } from "next/navigation";

import { usernameToLocalEmail } from "@/lib/auth/username";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: FormDataEntryValue | null) {
  const fallback = "/admin";

  if (typeof value !== "string" || !value.startsWith("/")) {
    return fallback;
  }

  if (value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export async function signInWithUsername(formData: FormData) {
  if (!isSupabaseConfigured()) {
    redirect("/auth/login?error=Supabase%20environment%20is%20not%20configured");
  }

  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));
  const email = usernameToLocalEmail(username);

  if (!email || !password) {
    redirect("/auth/login?error=Username%20and%20password%20are%20required");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(next);
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  redirect("/auth/login");
}
