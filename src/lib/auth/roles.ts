import type { UserRole } from "@/types/database";

export const ADMIN_ROLES: UserRole[] = ["admin", "super_admin"];

export function canAccessAdmin(role: UserRole | null | undefined) {
  return role === "admin" || role === "super_admin";
}

export function canManageUsers(role: UserRole | null | undefined) {
  return role === "super_admin";
}
