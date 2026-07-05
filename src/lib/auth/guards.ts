import { redirect } from "next/navigation";

import {
  canAccessAdmin,
  canAccessStudent,
  canAccessTeacher,
  canManageUsers,
} from "@/lib/auth/roles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

export async function getCurrentProfile() {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return data as Profile | null;
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
