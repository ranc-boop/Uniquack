import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const CONFIRMATION = "RESET_QUESTION_BANK";
const STORAGE_CHUNK_SIZE = 100;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const preservedTables = [
  "auth.users",
  "public.profiles",
  "public.ai_provider_profiles",
  "storage.buckets",
  "public.videos",
  "public.five_facet_tag_nodes",
  "public.five_facet_tag_edges",
  "public.five_facet_tag_aliases",
  "public.five_facet_curriculum_concept_mappings",
];

const resetTables = [
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Official video assignments will be rebuilt under the new five-facet system.",
    table: "five_facet_video_tag_assignments",
  },
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Official question assignments tied to old questions.",
    table: "five_facet_question_tag_assignments",
  },
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Review action drafts tied to old AI imports/questions.",
    table: "five_facet_tag_review_actions",
  },
  {
    deleteFilter: { column: "video_id", op: "not", value: null },
    reason: "Legacy video-to-tag join rows are compatibility-only.",
    table: "video_tags",
  },
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Batch import item previews and created-question links.",
    table: "import_batch_items",
  },
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Private AI import source/working asset metadata.",
    table: "import_batch_assets",
  },
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Manual/package/AI import batches for the old question bank.",
    table: "import_batches",
  },
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Question image/crop metadata.",
    table: "question_assets",
  },
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Admin-only question source PDF metadata.",
    table: "question_source_files",
  },
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Student/user attempts tied to old questions.",
    table: "user_question_attempts",
  },
  {
    deleteFilter: { column: "question_id", op: "not", value: null },
    reason: "Legacy question-to-tag join rows tied to old questions/tags.",
    table: "question_tags",
  },
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Rubric steps tied to old questions.",
    table: "question_rubric_steps",
  },
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Old question bank drafts/published/archive rows.",
    table: "questions",
  },
  {
    deleteFilter: { column: "id", op: "not", value: null },
    reason: "Legacy tag catalog. Five-facet catalog tables are preserved.",
    table: "tags",
  },
];

const storageTargets = [
  {
    bucket: "question-assets",
    table: "question_assets",
  },
  {
    bucket: "question-source-files",
    table: "question_source_files",
  },
  {
    bucket: "ai-import-sources",
    table: "import_batch_assets",
  },
];

function usage() {
  console.log(`Question Bank Reset Tool

Dry run:
  node scripts/admin-reset-question-bank.mjs --dry-run

Execute:
  node scripts/admin-reset-question-bank.mjs --execute --confirm ${CONFIRMATION}

This tool is destructive in execute mode. It preserves users, profiles,
provider settings, videos, and official five-facet catalog tables.`);
}

function parseArgs(argv) {
  const args = new Set(argv);
  const confirmIndex = argv.indexOf("--confirm");

  return {
    confirm: confirmIndex >= 0 ? argv[confirmIndex + 1] : "",
    dryRun: args.has("--dry-run"),
    execute: args.has("--execute"),
    help: args.has("--help") || args.has("-h"),
  };
}

function usernameToEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

function requireEnv() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}

async function signInSuperAdmin() {
  const username = process.env.TEST_SUPER_ADMIN_USERNAME;
  const password = process.env.TEST_SUPER_ADMIN_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Missing TEST_SUPER_ADMIN_USERNAME or TEST_SUPER_ADMIN_PASSWORD. Refusing to reset.",
    );
  }

  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error || !data.user) {
    throw new Error(`Super admin sign-in failed: ${error?.message ?? "No user returned."}`);
  }

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profileError) {
    throw new Error(`Could not verify profile role: ${profileError.message}`);
  }

  if (profile?.role !== "super_admin") {
    throw new Error("Signed-in reset user is not super_admin. Refusing to reset.");
  }

  return client;
}

async function countRows(client, table) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    return { count: null, error: error.message };
  }

  return { count: count ?? 0, error: null };
}

async function objectPaths(client, table) {
  const { data, error } = await client.from(table).select("object_path");
  if (error) {
    return [];
  }

  return (data ?? [])
    .map((row) => row.object_path)
    .filter((value) => typeof value === "string" && value.trim());
}

async function removeStorageObjects(client, bucket, paths) {
  let removed = 0;
  for (let index = 0; index < paths.length; index += STORAGE_CHUNK_SIZE) {
    const chunk = paths.slice(index, index + STORAGE_CHUNK_SIZE);
    if (!chunk.length) continue;
    const { error } = await client.storage.from(bucket).remove(chunk);
    if (error) {
      throw new Error(`${bucket} storage delete failed: ${error.message}`);
    }
    removed += chunk.length;
  }
  return removed;
}

async function deleteAllRows(client, target) {
  const { column, op, value } = target.deleteFilter;
  const query = client.from(target.table).delete();
  const response =
    op === "not"
      ? await query.not(column, "is", value)
      : await query.neq(column, value);

  if (response.error) {
    throw new Error(`${target.table} delete failed: ${response.error.message}`);
  }
}

async function printPlan(client) {
  console.log("WARNING: This reset is destructive in execute mode.");
  console.log("It clears question-bank/import/review data for a five-facet fresh start.");
  console.log("It preserves videos and official five-facet catalog tables.");
  console.log("");

  console.log("Preserved tables:");
  for (const table of preservedTables) {
    console.log(`  - ${table}`);
  }
  console.log("");

  console.log("Tables that would be cleared:");
  for (const target of resetTables) {
    const { count, error } = await countRows(client, target.table);
    const countLabel = error ? `unavailable (${error})` : String(count);
    console.log(`  - ${target.table}: ${countLabel} rows`);
    console.log(`    ${target.reason}`);
  }
}

async function executeReset(client) {
  console.log("Deleting storage objects tied to question-bank reset targets...");
  for (const target of storageTargets) {
    const paths = await objectPaths(client, target.table);
    const removed = await removeStorageObjects(client, target.bucket, paths);
    console.log(`  - ${target.bucket}: removed ${removed} objects`);
  }

  console.log("Deleting database rows...");
  for (const target of resetTables) {
    await deleteAllRows(client, target);
    console.log(`  - cleared ${target.table}`);
  }
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  usage();
  process.exit(0);
}

if (options.dryRun === options.execute) {
  usage();
  throw new Error("Choose exactly one mode: --dry-run or --execute.");
}

if (options.execute && options.confirm !== CONFIRMATION) {
  usage();
  throw new Error(`Execute mode requires: --confirm ${CONFIRMATION}`);
}

requireEnv();
const client = await signInSuperAdmin();
await printPlan(client);

if (options.dryRun) {
  console.log("");
  console.log("Dry run only. No rows, storage objects, or videos were deleted.");
  process.exit(0);
}

await executeReset(client);
console.log("");
console.log("Question bank reset completed.");
