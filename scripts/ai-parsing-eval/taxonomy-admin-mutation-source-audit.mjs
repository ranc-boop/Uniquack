import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = await readFile(
  resolve(root, "src/app/admin/tags/actions.ts"),
  "utf8",
);

assert(source.includes("await requireAdmin()") || source.includes("const profile = await requireAdmin()"));
assert(source.includes('.from("taxonomy_nodes").insert({'));
assert(source.includes('.from("taxonomy_edges").insert({'));
assert(source.includes('.from("taxonomy_nodes").delete().eq("tag_id", expectedTagId)'));

const createAction = source.slice(
  source.indexOf("export async function createTaxonomyNode"),
  source.indexOf("export async function deleteTaxonomyNode"),
);
const atomicRpcPresent = /\.rpc\([^)]*taxonomy/i.test(createAction);
const parentDemotionPresent =
  /taxonomy_nodes[\s\S]{0,300}update\([\s\S]{0,200}is_assignable[\s\S]{0,200}parent_tag_id/i.test(
    createAction,
  );

assert.equal(atomicRpcPresent, false);
assert.equal(parentDemotionPresent, false);

console.log("ADMIN_TAXONOMY_CREATE_AUTHORIZATION=ACTIVE_ADMIN_REQUIRED");
console.log("ADMIN_TAXONOMY_CREATE_TRANSACTION=TWO_STEP_WITH_COMPENSATING_NODE_DELETE");
console.log("ADMIN_TAXONOMY_PARENT_ASSIGNABILITY_UPDATE=ABSENT");
console.log("ADMIN_TAXONOMY_INVARIANT_GATE=FORWARD_ONLY_RPC_REQUIRED");
