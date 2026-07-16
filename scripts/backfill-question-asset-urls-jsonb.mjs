// Idempotent JSON-aware backfill: rewrites legacy public Supabase Storage URLs for
// question-assets embedded anywhere inside JSONB columns (question_snapshot,
// draft_payload) into the authorized internal route path
// (/api/question-assets/{assetId}).
//
// Unlike scripts/backfill-question-asset-urls.mjs (which targets plain HTML text
// columns), this script never casts a JSONB column to text and regex-replaces the
// whole blob. It fetches each row's JSONB value as a parsed JS object/array (which
// supabase-js already returns), recursively walks it, and only ever rewrites
// individual string leaves — via the exact same URL-matching logic as the plain-HTML
// backfill (scripts/lib/question-asset-url-rewrite.mjs), reused unchanged. JSON
// structure (keys, key order, array order, numbers, booleans, null) is always
// rebuilt identically; only matched URL substrings inside string values change.
//
// Safe to re-run: rows with no remaining legacy URLs anywhere in the JSON are
// skipped (no write issued). Never writes a signed URL. Never touches bucket
// visibility, Storage policies, Question RLS, or application rendering code.
//
// Usage:
//   node scripts/backfill-question-asset-urls-jsonb.mjs                 # dry run (default)
//   node scripts/backfill-question-asset-urls-jsonb.mjs --apply         # writes changes
//   node scripts/backfill-question-asset-urls-jsonb.mjs --report out.json
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and a service-role key
// (CLEAN_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY), matching the
// convention used by scripts/backfill-question-asset-urls.mjs and the other
// scripts/*.mjs ops scripts in this repo.

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

import {
  QUESTION_ASSET_JSONB_TARGETS,
  findLegacyQuestionAssetUrlsInJson,
  rewriteQuestionAssetUrlsInJson,
} from "./lib/question-asset-json-rewrite.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

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
    "Missing NEXT_PUBLIC_SUPABASE_URL or a service-role key (CLEAN_SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_ROLE_KEY).",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Fetch every row of `table` (id + the JSONB column), paginated. No text-cast
 * prefilter is used here — JSONB columns are fetched and parsed as JS values, and
 * legacy-URL detection happens in memory via recursive traversal, never via a SQL
 * text search against the serialized JSON.
 */
async function scanAllRows(table, column) {
  const rows = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(`id, ${column}`)
      .range(from, from + SCAN_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`scan failed for ${table}.${column}: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < SCAN_PAGE_SIZE) {
      break;
    }

    from += SCAN_PAGE_SIZE;
  }

  return rows;
}

/** Resolve question_assets.id for a batch of storage_path values. */
async function resolveAssetIds(storagePaths) {
  const assetIdByStoragePath = new Map();
  const uniquePaths = [...new Set(storagePaths)];

  for (let i = 0; i < uniquePaths.length; i += LOOKUP_CHUNK_SIZE) {
    const chunk = uniquePaths.slice(i, i + LOOKUP_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("question_assets")
      .select("id, storage_path")
      .in("storage_path", chunk);

    if (error) {
      throw new Error(`question_assets lookup failed: ${error.message}`);
    }

    for (const row of data ?? []) {
      assetIdByStoragePath.set(row.storage_path, row.id);
    }
  }

  return assetIdByStoragePath;
}

function pathToString(path) {
  return path.length === 0
    ? "$"
    : `$${path.map((segment) => (typeof segment === "number" ? `[${segment}]` : `.${segment}`)).join("")}`;
}

async function main() {
  console.log(`Mode: ${apply ? "APPLY (will write changes)" : "DRY RUN (no writes)"}`);
  console.log("");

  // Pass 1: fetch every row of every target JSONB column and find every legacy URL
  // occurrence anywhere inside the JSON value, collecting the distinct storage_path
  // values referenced across all targets before doing any lookups or writes.
  const rowsByTarget = [];
  const allStoragePaths = [];

  for (const target of QUESTION_ASSET_JSONB_TARGETS) {
    const allRows = await scanAllRows(target.table, target.column);
    const rowsWithLegacyUrls = [];

    for (const row of allRows) {
      const matches = findLegacyQuestionAssetUrlsInJson(row[target.column]);
      if (matches.length > 0) {
        rowsWithLegacyUrls.push(row);
        for (const match of matches) {
          allStoragePaths.push(match.storagePath);
        }
      }
    }

    rowsByTarget.push({ target, rows: rowsWithLegacyUrls });
    console.log(
      `Scanned ${target.table}.${target.column}: ${allRows.length} row(s) total, ${rowsWithLegacyUrls.length} with a legacy URL.`,
    );
  }

  // Pass 2: resolve all referenced storage_paths to question_assets.id in bulk.
  const assetIdByStoragePath = await resolveAssetIds(allStoragePaths);
  console.log(
    `\nResolved ${assetIdByStoragePath.size} of ${new Set(allStoragePaths).size} distinct storage_path value(s) to a question_assets row.\n`,
  );

  // Pass 3: rewrite each row's JSON value in memory; write only rows that changed.
  const summary = {
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    totals: { rowsScanned: 0, rowsChanged: 0, urlsReplaced: 0, urlsUnmapped: 0 },
    changes: [],
    unmapped: [],
  };

  for (const { target, rows } of rowsByTarget) {
    for (const row of rows) {
      summary.totals.rowsScanned += 1;
      const result = rewriteQuestionAssetUrlsInJson(row[target.column], assetIdByStoragePath);

      if (result.unmapped.length > 0) {
        summary.totals.urlsUnmapped += result.unmapped.length;
        summary.unmapped.push({
          table: target.table,
          column: target.column,
          rowId: row.id,
          entries: result.unmapped.map((entry) => ({
            path: pathToString(entry.path),
            url: entry.url,
            storagePath: entry.storagePath,
          })),
        });
      }

      if (!result.changed) {
        continue;
      }

      summary.totals.rowsChanged += 1;
      summary.totals.urlsReplaced += result.replaced;
      summary.changes.push({
        table: target.table,
        column: target.column,
        rowId: row.id,
        replaced: result.replaced,
      });

      if (apply) {
        const { error } = await supabase
          .from(target.table)
          .update({ [target.column]: result.value })
          .eq("id", row.id);

        if (error) {
          throw new Error(
            `update failed for ${target.table}.${target.column} id=${row.id}: ${error.message}`,
          );
        }
      }
    }
  }

  console.log("Summary:");
  console.log(`  rows scanned:   ${summary.totals.rowsScanned}`);
  console.log(`  rows changed:   ${summary.totals.rowsChanged}${apply ? "" : " (would change)"}`);
  console.log(`  URLs replaced:  ${summary.totals.urlsReplaced}${apply ? "" : " (would replace)"}`);
  console.log(`  URLs unmapped:  ${summary.totals.urlsUnmapped}`);

  if (summary.unmapped.length > 0) {
    console.warn(
      `\nWARNING: ${summary.totals.urlsUnmapped} URL occurrence(s) could not be mapped to a question_assets row and were left unchanged. See ${reportPath ? "the report file" : "the --report output"} for details.`,
    );
  }

  if (reportPath) {
    await writeFile(reportPath, JSON.stringify(summary, null, 2), "utf8");
    console.log(`\nFull report written to ${reportPath}`);
  }

  if (!apply) {
    console.log("\nDry run only — no rows were written. Re-run with --apply to write changes.");
  }
}

await main();
