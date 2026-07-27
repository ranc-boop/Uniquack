import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";
import type { Database, UserRole } from "@/types/database";

const ADMIN_ROLES: UserRole[] = ["admin", "super_admin"];
const TEACHER_ROLES: UserRole[] = ["teacher", "admin", "super_admin"];
const STUDENT_ROLES: UserRole[] = ["student"];

function redirectToLogin(request: NextRequest) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/auth/login";
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(loginUrl);
}

function redirectToUnauthorized(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = "/unauthorized";
  url.search = "";
  return NextResponse.redirect(url);
}

export async function updateSessionAndProtectRoutes(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    return response;
  }

  const { url, anonKey } = getSupabaseConfig();
  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const pathname = request.nextUrl.pathname;
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isTeacherRoute =
    pathname === "/teacher" || pathname.startsWith("/teacher/");
  const isStudentRoute =
    pathname === "/student" || pathname.startsWith("/student/");

  if (!isAdminRoute && !isTeacherRoute && !isStudentRoute) {
    await supabase.auth.getClaims();
    return response;
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (typeof userId !== "string" || !userId) {
    return redirectToLogin(request);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const role = profile?.role;

  if (pathname === "/admin/users" || pathname.startsWith("/admin/users/")) {
    return role === "super_admin" ? response : redirectToUnauthorized(request);
  }

  if (isAdminRoute) {
    return role && ADMIN_ROLES.includes(role)
      ? response
      : redirectToUnauthorized(request);
  }

  if (isTeacherRoute) {
    return role && TEACHER_ROLES.includes(role)
      ? response
      : redirectToUnauthorized(request);
  }

  return role && STUDENT_ROLES.includes(role)
    ? response
    : redirectToUnauthorized(request);
}
