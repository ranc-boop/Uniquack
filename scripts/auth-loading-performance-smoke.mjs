import { readFile } from "node:fs/promises";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FAIL ${message}`);
  }
  console.log(`PASS ${message}`);
}

const [guards, rootLayout, authNav, middleware, authActions] = await Promise.all([
  read("src/lib/auth/guards.ts"),
  read("src/app/layout.tsx"),
  read("src/components/auth-nav.tsx"),
  read("src/lib/supabase/middleware.ts"),
  read("src/app/auth/actions.ts"),
]);

assert(
  guards.includes('import { cache } from "react"') &&
    guards.includes("getCurrentAuthContext = cache(") &&
    guards.includes("supabase.auth.getClaims()") &&
    !guards.includes("supabase.auth.getUser()"),
  "RSC auth/profile lookup is request-memoized and uses verified claims",
);

assert(
  rootLayout.includes("getCurrentProfile()") &&
    authNav.includes("getCurrentAuthContext()") &&
    !rootLayout.includes("supabase.auth.getUser()") &&
    !authNav.includes("supabase.auth.getUser()") &&
    !rootLayout.includes('.from("profiles")') &&
    !authNav.includes('.from("profiles")'),
  "root navigation and auth navigation share the cached profile lookup",
);

assert(
  middleware.includes("supabase.auth.getClaims()") &&
    !middleware.includes("supabase.auth.getUser()") &&
    middleware.includes('.from("profiles")') &&
    middleware.includes('.select("*")') &&
    middleware.includes("AUTH_CONTEXT_HEADER") &&
    middleware.includes("ADMIN_ROLES.includes(role)") &&
    middleware.includes("TEACHER_ROLES.includes(role)") &&
    middleware.includes("STUDENT_ROLES.includes(role)"),
  "middleware verifies role and forwards its authenticated profile lookup to the RSC tree",
);

const signInIndex = authActions.indexOf("supabase.auth.signInWithPassword");
const roleQueryIndex = authActions.indexOf('.from("profiles")', signInIndex);
assert(
  signInIndex >= 0 &&
    roleQueryIndex > signInIndex &&
    authActions.includes("canAccessAdmin(profile?.role)") &&
    authActions.includes('profile?.role === "teacher"'),
  "login routing still validates the canonical profile role after password authentication",
);
