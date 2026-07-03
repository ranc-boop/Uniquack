import type { UserRole } from "@/types/database";

export const ADMIN_ROLES: UserRole[] = ["admin", "super_admin"];
export const TEACHER_ROLES: UserRole[] = ["teacher", "admin", "super_admin"];
export const STUDENT_ROLES: UserRole[] = ["student"];

export function canAccessAdmin(role: UserRole | null | undefined) {
  return role === "admin" || role === "super_admin";
}

export function canAccessTeacher(role: UserRole | null | undefined) {
  return role === "teacher" || role === "admin" || role === "super_admin";
}

export function canAccessStudent(role: UserRole | null | undefined) {
  return role === "student";
}

export function canManageUsers(role: UserRole | null | undefined) {
  return role === "super_admin";
}
