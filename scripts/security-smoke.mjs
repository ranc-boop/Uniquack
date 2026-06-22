import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

const migration = await read("supabase/migrations/0011_math_taxonomy_source_of_truth.sql");
assert(migration.includes("create table if not exists public.taxonomy_nodes"), "taxonomy_nodes table is missing");
assert(migration.includes("create table if not exists public.question_taxonomy_assignments"), "question taxonomy assignments table is missing");
assert(migration.includes("math.concept.algebra.equations"), "math-prefixed taxonomy seed is missing");
const legacySubjectRoot = ["subject", "math"].join(".");
assert(!migration.includes(legacySubjectRoot), `${legacySubjectRoot} should not exist in replacement taxonomy`);
console.log("PASS math-prefixed taxonomy schema and seed are present");

const rpc = await read("supabase/migrations/0012_taxonomy_question_search_rpc.sql");
assert(rpc.includes("create or replace function public.search_questions_by_taxonomy"), "taxonomy search RPC is missing");
assert(rpc.includes("matched_tags jsonb"), "taxonomy search RPC does not return matched tag metadata");
assert(rpc.includes("next_cursor text"), "taxonomy search RPC does not return a next cursor");
assert(rpc.includes("taxonomy_tag_path"), "taxonomy search RPC does not return tag paths");
assert(rpc.includes("to_tsvector"), "taxonomy search RPC does not use full-text search");
console.log("PASS taxonomy search RPC includes paths, cursor, and full-text matching");

const publicQuestions = await read("src/app/questions/page.tsx");
assert(publicQuestions.includes("search_questions_by_taxonomy"), "public questions page does not use taxonomy RPC");
console.log("PASS public questions page uses taxonomy search RPC");

const adminTags = await read("src/app/admin/tags/page.tsx");
assert(adminTags.includes("TaxonomyNodeCreateFields"), "taxonomy node form is missing parent tree picker");
assert(adminTags.includes("<details"), "taxonomy preview is missing collapsible tree rows");
console.log("PASS taxonomy admin uses parent tree creation and collapsible preview");

const batchJson = await read("src/lib/batch-import/json.ts");
assert(batchJson.includes("tag_ids"), "batch import does not accept tag_ids");
assert(!batchJson.includes(`tag_${"slugs"}`), "batch import still accepts legacy tag identifier arrays");
assert(!batchJson.includes(`tag_${"names"}`), "batch import still accepts legacy tag name arrays");
console.log("PASS batch import uses exact tag_ids only");
