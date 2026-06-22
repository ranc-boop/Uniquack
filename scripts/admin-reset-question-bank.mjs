import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const CONFIRMATION = "RESET_QUESTION_BANK";
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
  "public.taxonomy_facets",
  "public.taxonomy_nodes",
  "public.taxonomy_edges",
  "public.taxonomy_node_closure",
  "public.taxonomy_aliases",
];

const resetTables = [
  ["taxonomy_review_actions", "Review actions tied to old imported questions."],
  ["question_taxonomy_assignments", "Question taxonomy assignments tied to old questions."],
  ["import_batch_items", "Batch import item previews and created-question links."],
  ["import_batch_assets", "Private AI import source/working asset metadata."],
  ["import_batches", "Manual/package/AI import batches for the old question bank."],
  ["question_assets", "Question image/crop metadata."],
  ["question_source_files", "Admin-only question source file metadata."],
  ["user_question_attempts", "Student/user attempts tied to old questions."],
  ["question_rubric_steps", "Rubric steps tied to old questions."],
  ["videos", "Videos inherit taxonomy through deleted questions."],
  ["questions", "Old question bank drafts/published/archive rows."],
].map(([table, reason]) => ({
  deleteFilter: { column: "id", op: "not", value: null },
  reason,
  table,
}));

function usage() {
  console.log(`Question Bank Reset Tool\n\nDry run:\n  node scripts/admin-reset-question-bank.mjs --dry-run\n\nExecute:\n  node scripts/admin-reset-question-bank.mjs --execute --confirm ${CONFIRMATION}\n\nThis tool is destructive in execute mode. It preserves users, profiles, provider settings, and the database-backed math taxonomy catalog.`);
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
    throw new Error("Missing TEST_SUPER_ADMIN_USERNAME or TEST_SUPER_ADMIN_PASSWORD. Refusing to reset.");
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
  if (profileError) throw new Error(`Could not verify profile role: ${profileError.message}`);
  if (profile?.role !== "super_admin") throw new Error("Signed-in user is not a super_admin.");
  return client;
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("*", {
    count: "exact",
    head: true,
  });
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function deleteRows(client, { deleteFilter, table }) {
  const { error } = await client
    .from(table)
    .delete()
    .filter(deleteFilter.column, deleteFilter.op, deleteFilter.value);
  if (error) throw new Error(`${table} reset failed: ${error.message}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || (!options.dryRun && !options.execute)) {
    usage();
    return;
  }
  if (options.execute && options.confirm !== CONFIRMATION) {
    throw new Error(`Refusing to execute without --confirm ${CONFIRMATION}.`);
  }

  requireEnv();
  const client = await signInSuperAdmin();
  console.log("Preserving:");
  for (const table of preservedTables) console.log(`  - ${table}`);

  for (const entry of resetTables) {
    const before = await countRows(client, entry.table);
    if (options.dryRun) {
      console.log(`DRY ${entry.table}: ${before} rows would be deleted. ${entry.reason}`);
    } else {
      await deleteRows(client, entry);
      const after = await countRows(client, entry.table);
      console.log(`RESET ${entry.table}: ${before} -> ${after}. ${entry.reason}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
