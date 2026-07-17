import {
  assertQuestionAssetBackfillApplyAllowed,
  buildQuestionAssetBackfillPlan,
} from "./lib/question-asset-backfill-plan.mjs";
import {
  findMalformedLegacyQuestionAssetUrls,
  rewriteQuestionAssetUrls,
} from "./lib/question-asset-url-rewrite.mjs";
import {
  findMalformedLegacyQuestionAssetUrlsInJson,
  rewriteQuestionAssetUrlsInJson,
} from "./lib/question-asset-json-rewrite.mjs";

let failures = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`PASS ${message}`);
  } else {
    failures += 1;
    console.error(`FAIL ${message}`);
  }
}

const questionId = "11111111-1111-4111-8111-111111111111";
const assetId = "22222222-2222-4222-8222-222222222222";
const path = `questions/${questionId}/${assetId}.png`;
const legacyUrl = `https://example.invalid/storage/v1/object/public/question-assets/${path}`;
const mapping = new Map([[path, assetId]]);

{
  const rowsByTarget = [
    {
      target: { table: "questions", column: "content_html" },
      rows: [{ id: "row-a", content_html: `<img src="${legacyUrl}">` }],
    },
  ];
  const plan = buildQuestionAssetBackfillPlan({
    rowsByTarget,
    rewriteRow(row, target) {
      const result = rewriteQuestionAssetUrls(row[target.column], mapping);
      return { ...result, value: result.html, malformed: [] };
    },
  });
  assert(plan.updates.length === 1, "mapped HTML fixture produces one planned update");
  assertQuestionAssetBackfillApplyAllowed(plan);
  assert(true, "mapped HTML fixture passes the apply preflight");
}

{
  const json = { prompt: `<img src="${legacyUrl}">`, score: 1, flags: [true, null] };
  const result = rewriteQuestionAssetUrlsInJson(json, mapping);
  assert(
    JSON.stringify(result.value) ===
      JSON.stringify({ prompt: `<img src="/api/question-assets/${assetId}">`, score: 1, flags: [true, null] }),
    "JSONB rewrite changes only the mapped string leaf",
  );
  assert(JSON.stringify(json) === JSON.stringify({ prompt: `<img src="${legacyUrl}">`, score: 1, flags: [true, null] }), "JSONB input remains immutable");
}

{
  const rowsByTarget = [
    {
      target: { table: "questions", column: "content_html" },
      rows: [{ id: "row-b", content_html: `<img src="${legacyUrl}">` }],
    },
  ];
  const plan = buildQuestionAssetBackfillPlan({
    rowsByTarget,
    rewriteRow(row, target) {
      const result = rewriteQuestionAssetUrls(row[target.column], new Map());
      return { ...result, value: result.html, malformed: [] };
    },
  });
  let blocked = false;
  try {
    assertQuestionAssetBackfillApplyAllowed(plan);
  } catch {
    blocked = true;
  }
  assert(blocked && plan.updates.length === 0, "unmapped URL blocks apply before any planned write");
}

{
  const malformed = `/storage/v1/object/public/question-assets/${path}`;
  assert(findMalformedLegacyQuestionAssetUrls(malformed).length === 1, "malformed HTML URL candidate is detected");
  assert(
    findMalformedLegacyQuestionAssetUrlsInJson({ nested: malformed }).length === 1,
    "malformed JSONB URL candidate is detected",
  );
}

if (failures > 0) process.exitCode = 1;
