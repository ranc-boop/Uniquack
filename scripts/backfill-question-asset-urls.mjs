// Rewrites legacy public question-assets URLs in the five approved HTML fields.
// Process-only environment is required. Dry run is the default; --apply refuses
// before any write when a URL is unmapped or malformed.

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  assertQuestionAssetBackfillApplyAllowed,
  buildQuestionAssetBackfillPlan,
  createQuestionAssetBackfillReport,
} from "./lib/question-asset-backfill-plan.mjs";
import {
  QUESTION_ASSET_HTML_TARGETS,
  findLegacyQuestionAssetUrls,
  findMalformedLegacyQuestionAssetUrls,
  rewriteQuestionAssetUrls,
} from "./lib/question-asset-url-rewrite.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const reportArgIndex = args.indexOf("--report");
const reportPath =
  reportArgIndex >= 0 && args[reportArgIndex + 1]
    ? resolve(process.cwd(), args[reportArgIndex + 1])
    : null;
const SCAN_PAGE_SIZE = 500;
const LOOKUP_CHUNK_SIZE = 200;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing process-only NEXT_PUBLIC_SUPABASE_URL or a service-role key (CLEAN_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY).",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function scanTargetRows(table, column) {
  const rows = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(`id, ${column}`)
      .ilike(column, "%/storage/v1/object/public/question-assets/%")
      .range(from, from + SCAN_PAGE_SIZE - 1);

    if (error) throw new Error(`scan failed for ${table}.${column}: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < SCAN_PAGE_SIZE) break;
    from += SCAN_PAGE_SIZE;
  }

  return rows;
}

async function resolveAssetIds(storagePaths) {
  const assetIdByStoragePath = new Map();
  const uniquePaths = [...new Set(storagePaths)];

  for (let index = 0; index < uniquePaths.length; index += LOOKUP_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from("question_assets")
      .select("id, storage_path")
      .in("storage_path", uniquePaths.slice(index, index + LOOKUP_CHUNK_SIZE));
    if (error) throw new Error(`question_assets lookup failed: ${error.message}`);
    for (const row of data ?? []) assetIdByStoragePath.set(row.storage_path, row.id);
  }

  return assetIdByStoragePath;
}

async function writeReport(report) {
  if (!reportPath) return;
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Sanitized report written to ${reportPath}`);
}

function printSummary(summary, suffix) {
  console.log(`rows scanned: ${summary.totals.rowsScanned}`);
  console.log(`rows changed: ${summary.totals.rowsChanged}${suffix}`);
  console.log(`URLs replaced: ${summary.totals.urlsReplaced}${suffix}`);
  console.log(`URLs unmapped: ${summary.totals.urlsUnmapped}`);
  console.log(`URLs malformed: ${summary.totals.urlsMalformed}`);
}

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  const rowsByTarget = [];
  const allStoragePaths = [];

  for (const target of QUESTION_ASSET_HTML_TARGETS) {
    const rows = await scanTargetRows(target.table, target.column);
    rowsByTarget.push({ target, rows });
    for (const row of rows) {
      for (const match of findLegacyQuestionAssetUrls(row[target.column])) {
        allStoragePaths.push(match.storagePath);
      }
    }
  }

  const assetIdByStoragePath = await resolveAssetIds(allStoragePaths);
  const plan = buildQuestionAssetBackfillPlan({
    rowsByTarget,
    rewriteRow(row, target) {
      const result = rewriteQuestionAssetUrls(row[target.column], assetIdByStoragePath);
      return {
        ...result,
        value: result.html,
        malformed: findMalformedLegacyQuestionAssetUrls(row[target.column]),
      };
    },
  });

  if (!apply) {
    printSummary(plan.summary, " (would change)");
    await writeReport(createQuestionAssetBackfillReport({ mode: "dry-run", plan }));
    return;
  }

  try {
    assertQuestionAssetBackfillApplyAllowed(plan);
  } catch (error) {
    printSummary(plan.summary, " (blocked)");
    await writeReport(createQuestionAssetBackfillReport({ mode: "apply-blocked", plan }));
    throw error;
  }

  let appliedUpdates = 0;
  try {
    for (const update of plan.updates) {
      const { error } = await supabase
        .from(update.table)
        .update({ [update.column]: update.value })
        .eq("id", update.rowId);
      if (error) throw new Error(`update failed for ${update.table}.${update.column}: ${error.message}`);
      appliedUpdates += 1;
    }
  } catch (error) {
    await writeReport(
      createQuestionAssetBackfillReport({ mode: "apply-interrupted", plan, appliedUpdates }),
    );
    throw new Error(
      `Backfill stopped after ${appliedUpdates} applied row update(s); rerun is idempotent after operator review. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  printSummary(plan.summary, "");
  await writeReport(createQuestionAssetBackfillReport({ mode: "applied", plan, appliedUpdates }));
}

await main();
