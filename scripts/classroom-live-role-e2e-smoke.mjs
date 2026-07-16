import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const harness = await readFile(resolve(root, "scripts/classroom-live-role-e2e.mjs"), "utf8");

assert(
  harness.includes("CLASSROOM_LIVE_E2E_ENVIRONMENT") &&
    harness.includes("CLASSROOM_LIVE_E2E_EXPECTED_PROJECT_REF") &&
    harness.includes("CLASSROOM_LIVE_E2E_CONFIRM_CLEANUP"),
  "live Classroom harness must require explicit disposable target and cleanup acknowledgements",
);
assert(
  harness.includes('process.env.NODE_ENV?.trim().toLowerCase() === "production"') &&
    harness.includes("projectRefFromSupabaseUrl") &&
    harness.includes("expected_project_identity_mismatch"),
  "live Classroom harness must refuse production mode and a mismatched project identity",
);
assert(
  harness.includes("CLEAN_SUPABASE_SERVICE_ROLE_KEY") &&
    harness.includes("auth.admin.createUser") &&
    harness.includes("auth.admin.deleteUser"),
  "live Classroom harness must use a clean service-role fixture client for exact auth setup and cleanup",
);
assert(
  harness.includes("try {") &&
    harness.includes("finally {") &&
    harness.includes("cleanupFixtures(service, fixtures)"),
  "live Classroom harness must attempt cleanup in finally",
);
assert(
  harness.includes('delete().eq("classroom_id", fixtures.classroomId)') &&
    harness.includes('delete().eq("id", fixtures.classroomId)') &&
    harness.includes("deleteExactRows"),
  "live Classroom cleanup must delete only captured exact fixture identifiers",
);
assert(
  !harness.includes("dotenv") &&
    !harness.includes(".env.local") &&
    !harness.includes("appendFile") &&
    !harness.includes("process.env.TEST_"),
  "live Classroom harness must use process-only generated fixtures without loading or writing environment files",
);
assert(
  !/\.delete\(\)\.(?:neq|like|ilike|not|is)\(/.test(harness),
  "live Classroom harness must not use broad cleanup predicates",
);
assert(
  harness.includes("Student Classroom creation is denied") &&
    harness.includes("Anonymous Classroom creation is denied") &&
    harness.includes("Inactive Teacher Classroom creation is denied") &&
    harness.includes("Unrelated Teacher foreign-organization creation is denied") &&
    harness.includes("Removed Student cannot silently rejoin"),
  "live Classroom harness must cover required role denials and removed-student rejoin protection",
);
assert(
  harness.includes("bankMembers") &&
    harness.includes("reviewBatches") &&
    harness.includes("blueprints") &&
    harness.includes("publishedQuestions") &&
    harness.includes("questionAssets") &&
    harness.includes("practiceSessions"),
  "live Classroom harness must snapshot Bank and non-Classroom side effects",
);

console.log("PASS Classroom live role E2E harness safety/source checks");
