import { redirect } from "next/navigation";
import { cache } from "react";

import {
  canAccessAdmin,
  canAccessStudent,
  canAccessTeacher,
  canManageUsers,
} from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export type CurrentAuthContext = {
  email: string | null;
  profile: Profile | null;
  userId: string;
};

export const getCurrentAuthContext = cache(async (): Promise<CurrentAuthContext | null> => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (typeof userId !== "string" || !userId) {
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  return {
    email:
      typeof claimsData.claims.email === "string"
        ? claimsData.claims.email
        : null,
    profile: data as Profile | null,
    userId,
  };
});

export async function getCurrentProfile() {
  const context = await getCurrentAuthContext();
  return context?.profile ?? null;
}

export async function requireAdmin() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/auth/login?next=/admin");
  }

  if (!canAccessAdmin(profile.role)) {
    redirect("/unauthorized");
  }

  return profile;
}

export async function requireTeacher() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/auth/login?next=/teacher");
  }

  if (!canAccessTeacher(profile.role)) {
    redirect("/unauthorized");
  }

  return profile;
}

export async function requireStudent() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/auth/login?next=/student/classrooms");
  }

  if (!canAccessStudent(profile.role)) {
    redirect("/unauthorized");
  }

  return profile;
}

export async function requireSuperAdmin() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/auth/login?next=/admin/users");
  }

  if (!canManageUsers(profile.role)) {
    redirect("/unauthorized");
  }

  return profile;
}
