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

const [middleware, guards] = await Promise.all([
  read("src/lib/supabase/middleware.ts"),
  read("src/lib/auth/guards.ts"),
]);

assert(
  middleware.includes('requestHeaders.delete(AUTH_CONTEXT_HEADER)') &&
    middleware.includes('.select("*")') &&
    middleware.includes("requestHeaders.set(") &&
    middleware.includes("encodeURIComponent(JSON.stringify(authContext))"),
  "middleware removes spoofed auth context and only forwards a verified full profile",
);

assert(
  middleware.includes("pendingCookies") &&
    middleware.includes("createPassThroughResponse") &&
    middleware.includes("applyPendingCookies"),
  "middleware preserves refreshed Supabase cookies while rebuilding request headers",
);

const forwardedLookupIndex = guards.indexOf("getForwardedAuthContext()");
const fallbackClaimsIndex = guards.indexOf("supabase.auth.getClaims()");
assert(
  forwardedLookupIndex >= 0 &&
    fallbackClaimsIndex > forwardedLookupIndex &&
    guards.includes("isProfile(") &&
    guards.includes("profile.id !== parsed.userId"),
  "RSC guards prefer the verified middleware handoff and retain the direct auth fallback",
);
