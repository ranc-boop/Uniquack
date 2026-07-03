import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types/database";

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export function normalizeClassroomJoinCode(code: string) {
  return code.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function hashClassroomJoinCode(code: string) {
  return createHash("sha256")
    .update(normalizeClassroomJoinCode(code), "utf8")
    .digest("hex");
}

export function generateClassroomJoinCode() {
  const bytes = randomBytes(8);
  const characters = Array.from(bytes, (byte) => {
    return JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length];
  });
  return `${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
}

export function classroomJoinCodeHint(code: string) {
  const normalized = normalizeClassroomJoinCode(code);
  return normalized ? `...${normalized.slice(-4)}` : null;
}

export async function resolveClassroomOrganizationId({
  allowedRoles,
  profile,
  supabase,
}: {
  allowedRoles: Array<"admin" | "teacher" | "student">;
  profile: Profile;
  supabase: SupabaseServerClient;
}) {
  if (profile.default_organization_id) {
    return profile.default_organization_id;
  }

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .in("role", allowedRoles)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const organizationId = memberships?.[0]?.organization_id;

  if (!organizationId) {
    throw new Error(
      "No active organization membership was found for this classroom action.",
    );
  }

  return organizationId;
}

export function profileLabel(profile: {
  display_name?: string | null;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
}) {
  return (
    profile.display_name ||
    profile.full_name ||
    profile.username ||
    profile.email ||
    "Unknown user"
  );
}

export function isTeacherRole(role: UserRole | null | undefined) {
  return role === "teacher" || role === "admin" || role === "super_admin";
}
