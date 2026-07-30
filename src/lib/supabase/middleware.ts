import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { AUTH_CONTEXT_HEADER } from "@/lib/auth/request-context";
import {
  canAccessAdmin,
  canAccessStudent,
  canAccessTeacher,
  canManageUsers,
} from "@/lib/auth/roles";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/supabase/config";
import type { Database, Profile } from "@/types/database";

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

function isTeacherFocusRoute(pathname: string) {
  return (
    /^\/teacher\/banks\/[^/]+\/questions\/[^/]+\/preview$/.test(pathname) ||
    /^\/teacher\/banks\/[^/]+\/review\/[^/]+$/.test(pathname)
  );
}

function applyTeacherFocusHeaders(response: NextResponse, pathname: string) {
  if (!isTeacherFocusRoute(pathname)) return response;

  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export async function updateSessionAndProtectRoutes(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(AUTH_CONTEXT_HEADER);
  const pathname = request.nextUrl.pathname;

  let pendingCookies: Array<{
    name: string;
    options: CookieOptions;
    value: string;
  }> = [];

  function applyPendingCookies(response: NextResponse) {
    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });
    return applyTeacherFocusHeaders(response, pathname);
  }

  function createPassThroughResponse() {
    return applyPendingCookies(
      NextResponse.next({ request: { headers: requestHeaders } }),
    );
  }

  let response = createPassThroughResponse();

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
        const refreshedCookieHeader = request.headers.get("cookie");
        if (refreshedCookieHeader) {
          requestHeaders.set("cookie", refreshedCookieHeader);
        }
        const refreshedNames = new Set(cookiesToSet.map(({ name }) => name));
        pendingCookies = [
          ...pendingCookies.filter(({ name }) => !refreshedNames.has(name)),
          ...cookiesToSet,
        ];
        response = createPassThroughResponse();
      },
    },
  });

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
    return applyPendingCookies(redirectToLogin(request));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  const verifiedProfile = profile as Profile | null;
  const role = verifiedProfile?.role;

  if (verifiedProfile?.id === userId) {
    const authContext = {
      email:
        typeof claimsData.claims.email === "string"
          ? claimsData.claims.email
          : null,
      profile: verifiedProfile,
      userId,
    };
    requestHeaders.set(
      AUTH_CONTEXT_HEADER,
      encodeURIComponent(JSON.stringify(authContext)),
    );
    response = createPassThroughResponse();
  }

  if (pathname === "/admin/users" || pathname.startsWith("/admin/users/")) {
    return canManageUsers(role)
      ? response
      : applyPendingCookies(redirectToUnauthorized(request));
  }

  if (isAdminRoute) {
    return canAccessAdmin(role)
      ? response
      : applyPendingCookies(redirectToUnauthorized(request));
  }

  if (isTeacherRoute) {
    return canAccessTeacher(role)
      ? response
      : applyPendingCookies(redirectToUnauthorized(request));
  }

  return canAccessStudent(role)
    ? response
    : applyPendingCookies(redirectToUnauthorized(request));
}
