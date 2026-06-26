import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

const blueprintMigration = await readFile(
  resolve(root, "supabase/migrations/0015_question_blueprint_library.sql"),
  "utf8",
);
const blueprintFolderMigration = await readFile(
  resolve(root, "supabase/migrations/0016_question_blueprint_folders.sql"),
  "utf8",
);
const blueprintCalibrationMigration = await readFile(
  resolve(root, "supabase/migrations/0018_question_blueprint_calibration.sql"),
  "utf8",
);
const blueprintActions = await readFile(
  resolve(root, "src/app/admin/blueprints/actions.ts"),
  "utf8",
);
for (const tableName of [
  "question_blueprints",
  "question_blueprint_examples",
  "question_blueprint_review_actions",
]) {
  assert(
    blueprintMigration.includes(`alter table public.${tableName} enable row level security`),
    `${tableName} is missing RLS`,
  );
  assert(
    blueprintMigration.includes(`${tableName}_admin_crud`) &&
      blueprintMigration.includes("private.is_admin()"),
    `${tableName} is missing admin-only policy`,
  );
}
assert(!blueprintMigration.includes("to anon"), "question blueprint tables must not grant anon access");
assert(
  blueprintFolderMigration.includes("create table if not exists public.question_blueprint_folders") &&
    blueprintFolderMigration.includes("add column if not exists folder_id") &&
    blueprintFolderMigration.includes("alter table public.question_blueprint_folders enable row level security") &&
    blueprintFolderMigration.includes("question_blueprint_folders_admin_crud") &&
    blueprintFolderMigration.includes("private.is_admin()") &&
    !blueprintFolderMigration.includes("to anon"),
  "question blueprint folder migration must enable admin-only RLS and avoid anon grants",
);
assert(
  blueprintCalibrationMigration.includes("create table if not exists public.question_blueprint_calibration_runs") &&
    blueprintCalibrationMigration.includes("alter table public.question_blueprint_calibration_runs enable row level security") &&
    blueprintCalibrationMigration.includes("question_blueprint_calibration_runs_admin_crud") &&
    blueprintCalibrationMigration.includes("private.is_admin()") &&
    blueprintCalibrationMigration.includes("generation_readiness") &&
    !blueprintCalibrationMigration.includes("to anon"),
  "question blueprint calibration migration must enable admin-only RLS and avoid anon grants",
);
assert(
  blueprintMigration.includes("deleted_at timestamptz") &&
    blueprintMigration.includes("status in ('draft', 'approved', 'deprecated')"),
  "question blueprint migration must support lifecycle status and soft delete",
);
assert(
  blueprintActions.includes("archiveQuestionBlueprint") &&
    blueprintActions.includes("restoreQuestionBlueprint") &&
    blueprintActions.includes("moveQuestionBlueprintToTrash") &&
    blueprintActions.includes("archiveQuestionBlueprintFolder") &&
    blueprintActions.includes("restoreQuestionBlueprintFolder") &&
    blueprintActions.includes("moveQuestionBlueprintToFolder") &&
    blueprintActions.includes("deleted_at: new Date().toISOString()") &&
    !blueprintActions.includes(".delete("),
  "question blueprint lifecycle must use admin soft-delete actions and never hard-delete",
);
console.log("PASS question blueprint migration enables admin-only RLS");

const anon = createClient(supabaseUrl, supabaseAnonKey);
const { data: nodes, error: nodesError } = await anon
  .from("taxonomy_nodes")
  .select("tag_id,status")
  .eq("status", "active")
  .limit(5);
assert(!nodesError, `taxonomy_nodes public read failed: ${nodesError?.message}`);
assert(Array.isArray(nodes), "taxonomy_nodes did not return an array");
console.log("PASS public can read active taxonomy nodes");

const { data: rpcRows, error: rpcError } = await anon.rpc("search_questions_by_taxonomy", {
  assignment_review_status: "approved",
  difficulty_max: 1000,
  difficulty_min: 0,
  exclude_tag_ids: [],
  include_tag_ids: [],
  page_limit: 1,
  page_offset: 0,
  query_text: null,
  question_status: "published",
});
assert(!rpcError, `public taxonomy search RPC failed: ${rpcError?.message}`);
assert(Array.isArray(rpcRows), "taxonomy search RPC did not return rows");
console.log("PASS public can call taxonomy search RPC for published approved content");

const { error: insertError } = await anon.from("taxonomy_nodes").insert({
  tag_id: `math.concept.rls_denied_${Date.now()}`,
  node_kind: "tag",
  subject_tag_id: "math",
  facet_key: "concept",
  label: "RLS denied",
  is_assignable: true,
  status: "active",
});
assert(insertError, "anon unexpectedly inserted taxonomy_nodes");
console.log("PASS anon cannot write taxonomy nodes");
