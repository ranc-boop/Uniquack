// Pure, offline tests for scripts/lib/question-asset-url-rewrite.mjs.
// No database or network access — run with: node scripts/question-asset-url-backfill-test.mjs

import {
  findLegacyQuestionAssetUrls,
  rewriteQuestionAssetUrls,
  LEGACY_QUESTION_ASSET_URL_PATTERN,
} from "./lib/question-asset-url-rewrite.mjs";

let passed = 0;
let failed = 0;

function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL ${label}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
  }
}

function assert(condition, label) {
  assertEqual(Boolean(condition), true, label);
}

const QUESTION_ID = "11111111-1111-4111-8111-111111111111";
const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const STORAGE_PATH = `questions/${QUESTION_ID}/${ASSET_ID}.png`;
const LEGACY_URL = `https://abcxyz.supabase.co/storage/v1/object/public/question-assets/${STORAGE_PATH}`;

// --- findLegacyQuestionAssetUrls ---

assertEqual(
  findLegacyQuestionAssetUrls(null),
  [],
  "findLegacyQuestionAssetUrls: null input returns empty array",
);

assertEqual(
  findLegacyQuestionAssetUrls(""),
  [],
  "findLegacyQuestionAssetUrls: empty string returns empty array",
);

assertEqual(
  findLegacyQuestionAssetUrls(`<p>no images here</p>`),
  [],
  "findLegacyQuestionAssetUrls: html with no matches returns empty array",
);

assertEqual(
  findLegacyQuestionAssetUrls(`<img src="${LEGACY_URL}" alt="fig" />`),
  [{ url: LEGACY_URL, storagePath: STORAGE_PATH }],
  "findLegacyQuestionAssetUrls: extracts a single legacy URL and its storage path",
);

{
  const secondAssetId = "33333333-3333-4333-8333-333333333333";
  const secondPath = `questions/${QUESTION_ID}/${secondAssetId}.png`;
  const secondUrl = `https://abcxyz.supabase.co/storage/v1/object/public/question-assets/${secondPath}`;
  const html = `<p><img src="${LEGACY_URL}"/></p><p><img src="${secondUrl}"/></p>`;
  assertEqual(
    findLegacyQuestionAssetUrls(html),
    [
      { url: LEGACY_URL, storagePath: STORAGE_PATH },
      { url: secondUrl, storagePath: secondPath },
    ],
    "findLegacyQuestionAssetUrls: extracts multiple distinct legacy URLs in order",
  );
}

assertEqual(
  findLegacyQuestionAssetUrls(`<img src="/api/question-assets/${ASSET_ID}" />`),
  [],
  "findLegacyQuestionAssetUrls: already-migrated route path is not matched",
);

// --- rewriteQuestionAssetUrls: correctness ---

{
  const map = new Map([[STORAGE_PATH, ASSET_ID]]);
  const html = `<p>Look at <img src="${LEGACY_URL}" alt="fig"/> above.</p>`;
  const result = rewriteQuestionAssetUrls(html, map);
  assertEqual(
    result.html,
    `<p>Look at <img src="/api/question-assets/${ASSET_ID}" alt="fig"/> above.</p>`,
    "rewriteQuestionAssetUrls: replaces a mapped legacy URL with the route path",
  );
  assert(result.changed, "rewriteQuestionAssetUrls: changed=true when a replacement happened");
  assertEqual(result.replaced, 1, "rewriteQuestionAssetUrls: replaced count is 1");
  assertEqual(result.unmapped, [], "rewriteQuestionAssetUrls: no unmapped entries when resolved");
}

{
  // Unrelated HTML around the URL must be preserved exactly, including attributes,
  // whitespace, and unrelated tags.
  const map = new Map([[STORAGE_PATH, ASSET_ID]]);
  const html = `<div class="figure" data-x="1">\n  <img src="${LEGACY_URL}" alt="a &amp; b" width="120"/>\n  <em>caption</em>\n</div>`;
  const result = rewriteQuestionAssetUrls(html, map);
  assertEqual(
    result.html,
    `<div class="figure" data-x="1">\n  <img src="/api/question-assets/${ASSET_ID}" alt="a &amp; b" width="120"/>\n  <em>caption</em>\n</div>`,
    "rewriteQuestionAssetUrls: preserves surrounding HTML, attributes, and whitespace exactly",
  );
}

{
  // Unmapped occurrence: no matching question_assets row. Must be left untouched
  // and reported, not silently dropped or replaced with a guess.
  const emptyMap = new Map();
  const html = `<img src="${LEGACY_URL}"/>`;
  const result = rewriteQuestionAssetUrls(html, emptyMap);
  assertEqual(result.html, html, "rewriteQuestionAssetUrls: unmapped URL is left byte-for-byte unchanged");
  assert(!result.changed, "rewriteQuestionAssetUrls: changed=false when nothing was mapped");
  assertEqual(result.replaced, 0, "rewriteQuestionAssetUrls: replaced count is 0 when unmapped");
  assertEqual(
    result.unmapped,
    [{ url: LEGACY_URL, storagePath: STORAGE_PATH }],
    "rewriteQuestionAssetUrls: unmapped occurrence is reported with its URL and storage path",
  );
}

{
  // Mixed: one mapped, one unmapped, in the same field.
  const secondAssetId = "44444444-4444-4444-8444-444444444444";
  const secondPath = `questions/${QUESTION_ID}/${secondAssetId}.png`;
  const secondUrl = `https://abcxyz.supabase.co/storage/v1/object/public/question-assets/${secondPath}`;
  const map = new Map([[STORAGE_PATH, ASSET_ID]]); // secondPath deliberately absent
  const html = `<img src="${LEGACY_URL}"/><img src="${secondUrl}"/>`;
  const result = rewriteQuestionAssetUrls(html, map);
  assertEqual(
    result.html,
    `<img src="/api/question-assets/${ASSET_ID}"/><img src="${secondUrl}"/>`,
    "rewriteQuestionAssetUrls: mixed mapped/unmapped — only the mapped one is replaced",
  );
  assertEqual(result.replaced, 1, "rewriteQuestionAssetUrls: mixed case reports 1 replacement");
  assertEqual(
    result.unmapped,
    [{ url: secondUrl, storagePath: secondPath }],
    "rewriteQuestionAssetUrls: mixed case reports exactly the unmapped occurrence",
  );
}

assertEqual(
  rewriteQuestionAssetUrls(null, new Map()),
  { html: null, changed: false, replaced: 0, unmapped: [] },
  "rewriteQuestionAssetUrls: null input is a no-op",
);

assertEqual(
  rewriteQuestionAssetUrls("<p>no images</p>", new Map()),
  { html: "<p>no images</p>", changed: false, replaced: 0, unmapped: [] },
  "rewriteQuestionAssetUrls: html with no legacy URLs is unchanged and reports nothing",
);

// --- Idempotency ---

{
  const map = new Map([[STORAGE_PATH, ASSET_ID]]);
  const html = `<img src="${LEGACY_URL}"/>`;
  const first = rewriteQuestionAssetUrls(html, map);
  const second = rewriteQuestionAssetUrls(first.html, map);
  assertEqual(
    second.html,
    first.html,
    "idempotency: running the rewrite twice produces the same output the second time",
  );
  assert(!second.changed, "idempotency: second run reports changed=false");
  assertEqual(second.replaced, 0, "idempotency: second run replaces nothing further");
  assertEqual(second.unmapped, [], "idempotency: second run has no unmapped entries");
}

{
  // Idempotency must also hold when the row was never touched (already fine, no
  // legacy URLs at all — e.g. authored directly against the new route, or plain text).
  const map = new Map([[STORAGE_PATH, ASSET_ID]]);
  const html = `<img src="/api/question-assets/${ASSET_ID}"/>`;
  const result = rewriteQuestionAssetUrls(html, map);
  assertEqual(result.html, html, "idempotency: already-migrated content is left unchanged");
  assert(!result.changed, "idempotency: already-migrated content reports changed=false");
}

// --- Regex hygiene ---

assert(
  LEGACY_QUESTION_ASSET_URL_PATTERN.global,
  "LEGACY_QUESTION_ASSET_URL_PATTERN: is a global regex (required for matchAll/replace-all semantics)",
);

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exitCode = 1;
}
