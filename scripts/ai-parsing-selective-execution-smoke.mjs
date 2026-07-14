import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

// Preserve the existing conservative planner coverage, then verify its rollout
// boundary separately. Neither smoke path calls a provider.
await import("./ai-parsing-selective-packet-execution-smoke.mjs");

const [adminActions, adminPage, errors, migration, routing, service, teacherActions, worker] = await Promise.all([
  read("src/app/admin/ai-settings/actions.ts"),
  read("src/app/admin/ai-settings/page.tsx"),
  read("src/lib/ai-providers/errors.ts"),
  read("supabase/clean-migrations/0037_ai_selective_execution_control.sql"),
  read("src/lib/ai-providers/routing.ts"),
  read("src/lib/ai-pdf-import/service.ts"),
  read("src/app/teacher/banks/actions.ts"),
  read("src/lib/ai-jobs/worker.ts"),
]);

assert(
  migration.includes("selective_execution_enabled boolean not null default false") &&
    migration.includes("private.is_trusted_ai_provider_worker") &&
    migration.includes("grant execute on function public.get_ai_operations_worker_control() to service_role"),
  "selective execution must remain disabled by default and readable only by the trusted worker",
);
assert(
  adminActions.includes("await requireSuperAdmin()") &&
    adminActions.includes("selective_execution_enabled") &&
    adminPage.includes("Enable selective PDF execution for controlled validation"),
  "only the existing super-admin operations control may enable selective execution",
);
assert(
  service.includes("input.selectiveExecutionEnabled !== true") &&
    service.includes("selective_execution_disabled_by_operations_control") &&
    service.includes("full document will be used safely"),
  "AI PDF imports must use the safe full-document path unless the trusted worker explicitly enables selective execution",
);
assert(
  worker.includes("selectiveExecutionEnabled: control.selectiveExecutionEnabled") &&
    worker.includes("selectiveExecutionEnabled,") &&
    !teacherActions.includes("selectiveExecutionEnabled"),
  "teacher import actions must not choose selective execution; the worker alone receives the server control",
);
assert(
  errors.includes("statusCode === 401 || statusCode === 403") &&
    errors.includes('return "provider_permission_error"') &&
    routing.includes('if (!eligible) throw error;') &&
    !routing.slice(
      routing.indexOf("function circuitEligibleError"),
      routing.indexOf("async function acquireHalfOpenProbe"),
    ).includes("provider_permission_error"),
  "403 provider permission failures must remain non-retryable and must not trigger arbitrary fallback routing",
);

console.log("PASS AI Parsing selective execution rollout-control smoke");
