import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  }).outputText;
}

async function loadProviderSafety() {
  const errorsSource = transpile(
    await read("src/lib/ai-providers/errors.ts"),
    "errors.ts",
  ).replace('import "server-only";', "");
  const errorsUrl = moduleUrl(errorsSource);
  const safetySource = transpile(
    await read("src/lib/practice/provider-safety.ts"),
    "provider-safety.ts",
  )
    .replace('import "server-only";', "")
    .replace('from "@/lib/ai-providers/errors"', `from "${errorsUrl}"`);

  return import(moduleUrl(safetySource));
}

async function loadPracticeContext() {
  const contextSource = transpile(
    await read("src/lib/practice/context.ts"),
    "context.ts",
  )
    .replace('import "server-only";', "")
    .replace(
      'import { CURRENT_PRACTICE_SESSION_SCHEMA_VERSION } from "@/lib/practice/schema";',
      'const CURRENT_PRACTICE_SESSION_SCHEMA_VERSION = "practice-test";',
    );

  return import(moduleUrl(contextSource));
}

function assertAuthorizedBeforeResolver(route, routeName) {
  const authGuard = route.indexOf("if (auth.response)");
  const resolver = route.search(/loadPracticeAIProfile\s*\(/);

  assert(authGuard >= 0, `${routeName} must deny anonymous callers`);
  assert(resolver > authGuard, `${routeName} must authorize the caller before provider service-role resolution`);
  assert(!/provider(?:Id|Profile|Model)|credential(?:Ref)?\s*[:=]/i.test(route), `${routeName} must not accept caller-selected provider configuration`);
}

const [
  ai,
  profiles,
  auth,
  contextSource,
  client,
  adminPage,
  adminActions,
  gradeRoute,
  recommendRoute,
  reviewRoute,
  hintRoute,
  titleRoute,
  mergeRoute,
  sessionsRoute,
  practiceLoader,
  practiceBoundary,
] = await Promise.all([
  read("src/lib/practice/ai.ts"),
  read("src/lib/ai-providers/profiles.ts"),
  read("src/lib/practice/auth.ts"),
  read("src/lib/practice/context.ts"),
  read("src/components/practice/practice-agent-client.tsx"),
  read("src/app/admin/ai-settings/page.tsx"),
  read("src/app/admin/ai-settings/actions.ts"),
  read("src/app/api/practice/grade/route.ts"),
  read("src/app/api/practice/recommend/route.ts"),
  read("src/app/api/practice/review/route.ts"),
  read("src/app/api/practice/hint/route.ts"),
  read("src/app/api/practice/sessions/title/route.ts"),
  read("src/app/api/practice/preferences/merge/run/route.ts"),
  read("src/app/api/practice/sessions/route.ts"),
  read("src/components/practice/practice-agent-loader.tsx"),
  read("src/components/practice/practice-workspace-error-boundary.tsx"),
]);

assert(
  ai.includes("listEnabledAIProviderProfilesForServerUse") &&
    ai.includes("loadAIProviderProfileForServerUse") &&
    ai.includes("resolveAIProviderRoute") &&
    ai.includes("runWithAIProviderRoute") &&
    ai.includes('operationKind: "practice_generation"') &&
    !ai.includes("listEnabledAIProviderProfiles(supabase)"),
  "Practice must resolve enabled profiles through the current server-side provider router",
);
assert(
  ai.includes("compatible.find((profile) => profile.is_default)") &&
    ai.includes("providerSupportsPractice") &&
    !ai.includes("profiles.find((profile) => /deepseek"),
  "Practice provider selection must be admin-defaulted and capability-validated, not provider-name biased",
);
assert(
  !ai.includes("requireAIProviderGatewayToken") &&
    !ai.includes("list_enabled_ai_provider_profiles_for_gateway"),
  "Practice execution must not call the super-admin gateway path",
);
assert(
  profiles.includes("listEnabledAIProviderProfilesForServerUse") &&
    profiles.includes("createServiceRoleClient") &&
    profiles.includes("organization_id") &&
    profiles.includes('.eq("enabled", true)') &&
    profiles.includes("loadAIProviderProfileForServerUse"),
  "server-use resolver must validate enabled and scoped profiles before decrypting credentials",
);

assertAuthorizedBeforeResolver(recommendRoute, "recommend route");
assertAuthorizedBeforeResolver(reviewRoute, "review route");
assertAuthorizedBeforeResolver(hintRoute, "hint route");
assertAuthorizedBeforeResolver(titleRoute, "session-title route");
assertAuthorizedBeforeResolver(mergeRoute, "preference-merge route");
assert(
  auth.includes("Authentication required.") && !auth.includes("requireSuperAdmin"),
  "Practice keeps its current authenticated-user contract; inactive-user enforcement remains an Auth/live-fixture concern",
);

assert(
  adminPage.includes("requireSuperAdmin") && adminActions.includes("requireSuperAdmin"),
  "Admin provider management must remain super-admin-only",
);
assert(
  ![recommendRoute, reviewRoute, hintRoute, titleRoute, mergeRoute].some((route) =>
    route.includes("requireAIProviderGatewayToken") || route.includes("list_enabled_ai_provider_profiles_for_gateway"),
  ),
  "normal Practice routes must not invoke provider-management RPCs",
);

assert(
  !ai.includes("text.slice(0, 800)") &&
    !ai.includes("body: text") &&
    !ai.includes("body: contentText"),
  "Practice model callers must not retain raw upstream response bodies in errors or full-call log payloads",
);
assert(
  contextSource.includes("PRACTICE_FULL_CALL_LOG_RETENTION_DAYS") &&
    contextSource.includes("isSharedPracticeRuntime") &&
    contextSource.includes("sanitizePracticeLogValue") &&
    !contextSource.includes("NEXT_PUBLIC_PRACTICE_AGENT_FULL_CALL_LOGS"),
  "full-call logs must be local-only, bounded, and controlled by a non-public process variable",
);
assert(
  client.includes("function parsePracticeSsePayload") &&
    client.includes("A live practice update could not be read") &&
    client.includes("parseSseEvents(done ? `${buffer}\\n\\n` : buffer)") &&
    client.includes("appendRoundReviewDelta") &&
    client.includes("requestAnimationFrame") &&
    !client.includes("JSON.parse(item.data)"),
  "browser SSE updates must flush final events and batch safe retryable rendering",
);
assert(
  sessionsRoute.includes('searchParams.get("includeActive")') &&
    sessionsRoute.includes('includeActive && sessions[0]') &&
    client.includes("/api/practice/sessions?includeActive=0"),
  "session refreshes must avoid duplicate active-session detail loads when a session is already selected",
);
assert(
  client.includes("function isReusableEmptyPracticeSession") &&
    client.includes("session.roundCount === 0") &&
    client.includes("session.sessionThreadMessages?.length") &&
    client.includes("handedOffToSessionSwitch") &&
    client.includes("switchSession(reusableSession.id)"),
  "new-session actions must reuse a compatible empty thread and hand off through the normal session switch flow",
);
assert(
  practiceLoader.includes("PracticeWorkspaceErrorBoundary") &&
    practiceBoundary.includes("Your saved sessions and submitted work have not been removed") &&
    client.includes("workspaceLoading") &&
    client.includes("sessionAction") &&
    client.includes("isReviewStreaming"),
  "Practice must preserve a recoverable workspace state while loading, switching, and reviewing",
);
assert(
  !gradeRoute.includes("loadPracticeAIProfile") &&
    gradeRoute.includes("updateLinkedAssignmentProgressAfterPractice"),
  "deterministic grading and assignment evidence linkage must remain provider-independent",
);

const providerSafety = await loadProviderSafety();
const fakeKey = `AIza${"a".repeat(32)}`;
const safeFailure = providerSafety.safePracticeProviderFailure({
  message: `Provider 503 rejected Bearer ${fakeKey} with a private response body`,
  status: 503,
});
assert(
  safeFailure.code === "provider_unavailable" &&
    !JSON.stringify(safeFailure).includes(fakeKey) &&
    !safeFailure.message.includes("503"),
  "safe Practice provider errors must classify failures without returning upstream detail",
);

const context = await loadPracticeContext();
const previousEnvironment = {
  CI: process.env.CI,
  NODE_ENV: process.env.NODE_ENV,
  PRACTICE_AGENT_FULL_CALL_LOGS: process.env.PRACTICE_AGENT_FULL_CALL_LOGS,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
};
try {
  process.env.PRACTICE_AGENT_FULL_CALL_LOGS = "true";
  process.env.NODE_ENV = "production";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.CI;
  assert(context.isPracticeFullCallLogEnabled() === false, "production must fail closed for Practice full-call logs");

  process.env.NODE_ENV = "development";
  assert(context.isPracticeFullCallLogEnabled() === true, "local development may explicitly enable sanitized Practice full-call logs");
  const sanitized = context.sanitizePracticeLogValue({
    body: "private prompt",
    headers: { Authorization: `Bearer ${fakeKey}`, Cookie: "session=private" },
    phase: "review",
    signedUrl: "https://example.test/file?token=private",
    statusCode: 503,
  });
  assert(
    JSON.stringify(sanitized).includes("[omitted]") &&
      !JSON.stringify(sanitized).includes(fakeKey) &&
      !JSON.stringify(sanitized).includes("private prompt"),
    "full-call log sanitization must omit prompts, credentials, cookies, and signed URLs",
  );
} finally {
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

console.log("PASS Practice provider execution smoke");
