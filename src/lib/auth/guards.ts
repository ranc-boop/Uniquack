import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { AUTH_CONTEXT_HEADER } from "@/lib/auth/request-context";
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

const USER_ROLES = new Set(["super_admin", "admin", "teacher", "student"]);

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const profile = value as Record<string, unknown>;
  return (
    typeof profile.id === "string" &&
    typeof profile.username === "string" &&
    isNullableString(profile.email) &&
    isNullableString(profile.full_name) &&
    isNullableString(profile.avatar_url) &&
    isNullableString(profile.display_name) &&
    typeof profile.role === "string" &&
    USER_ROLES.has(profile.role) &&
    (profile.status === "active" || profile.status === "disabled") &&
    isNullableString(profile.default_organization_id) &&
    typeof profile.created_at === "string" &&
    typeof profile.updated_at === "string"
  );
}

async function getForwardedAuthContext(): Promise<CurrentAuthContext | null> {
  const encoded = (await headers()).get(AUTH_CONTEXT_HEADER);
  if (!encoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(encoded)) as Record<
      string,
      unknown
    >;
    if (
      typeof parsed.userId !== "string" ||
      !parsed.userId ||
      !isNullableString(parsed.email) ||
      !isProfile(parsed.profile) ||
      parsed.profile.id !== parsed.userId
    ) {
      return null;
    }
    return parsed as CurrentAuthContext;
  } catch {
    return null;
  }
}

export const getCurrentAuthContext = cache(async (): Promise<CurrentAuthContext | null> => {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const forwardedContext = await getForwardedAuthContext();
  if (forwardedContext) {
    return forwardedContext;
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
