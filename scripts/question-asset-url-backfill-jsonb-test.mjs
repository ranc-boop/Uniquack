// Pure, offline tests for scripts/lib/question-asset-json-rewrite.mjs.
// No database or network access — run with:
//   node scripts/question-asset-url-backfill-jsonb-test.mjs

import {
  findLegacyQuestionAssetUrlsInJson,
  rewriteQuestionAssetUrlsInJson,
} from "./lib/question-asset-json-rewrite.mjs";

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
const ASSET_ID_A = "22222222-2222-4222-8222-222222222222";
const ASSET_ID_B = "33333333-3333-4333-8333-333333333333";
const PATH_A = `questions/${QUESTION_ID}/${ASSET_ID_A}.png`;
const PATH_B = `questions/${QUESTION_ID}/${ASSET_ID_B}.png`;
const URL_A = `https://abcxyz.supabase.co/storage/v1/object/public/question-assets/${PATH_A}`;
const URL_B = `https://abcxyz.supabase.co/storage/v1/object/public/question-assets/${PATH_B}`;

// --- Mixed JSON value types: numbers, booleans, null, strings must be preserved ---

{
  const input = {
    id: 42,
    active: true,
    deletedAt: null,
    title: `Question with <img src="${URL_A}"/>`,
  };
  const map = new Map([[PATH_A, ASSET_ID_A]]);
  const result = rewriteQuestionAssetUrlsInJson(input, map);

  assertEqual(result.value.id, 42, "mixed types: number is preserved exactly");
  assertEqual(result.value.active, true, "mixed types: boolean is preserved exactly");
  assertEqual(result.value.deletedAt, null, "mixed types: null is preserved exactly");
  assertEqual(
    result.value.title,
    `Question with <img src="/api/question-assets/${ASSET_ID_A}"/>`,
    "mixed types: string leaf containing a URL is rewritten",
  );
  assert(result.changed, "mixed types: changed=true");
  assertEqual(result.replaced, 1, "mixed types: replaced=1");
}

// --- Nested objects ---

{
  const input = {
    question: {
      content: {
        html: `<img src="${URL_A}"/>`,
        meta: { author: "system" },
      },
    },
  };
  const map = new Map([[PATH_A, ASSET_ID_A]]);
  const result = rewriteQuestionAssetUrlsInJson(input, map);

  assertEqual(
    result.value,
    {
      question: {
        content: {
          html: `<img src="/api/question-assets/${ASSET_ID_A}"/>`,
          meta: { author: "system" },
        },
      },
    },
    "nested objects: deeply nested string is rewritten, sibling keys preserved",
  );
  assert(result.changed, "nested objects: changed=true");
}

// --- Nested arrays ---

{
  const input = {
    images: [`<img src="${URL_A}"/>`, "plain text", `<img src="${URL_B}"/>`],
  };
  const map = new Map([
    [PATH_A, ASSET_ID_A],
    [PATH_B, ASSET_ID_B],
  ]);
  const result = rewriteQuestionAssetUrlsInJson(input, map);

  assertEqual(
    result.value,
    {
      images: [
        `<img src="/api/question-assets/${ASSET_ID_A}"/>`,
        "plain text",
        `<img src="/api/question-assets/${ASSET_ID_B}"/>`,
      ],
    },
    "nested arrays: each array element is rewritten independently, order preserved",
  );
  assertEqual(result.replaced, 2, "nested arrays: replaced=2 across the array");
}

{
  // Array of objects — a common shape for question option lists / rubric steps.
  const input = {
    options: [
      { id: "a", label: `<img src="${URL_A}"/>` },
      { id: "b", label: "no image here" },
    ],
  };
  const map = new Map([[PATH_A, ASSET_ID_A]]);
  const result = rewriteQuestionAssetUrlsInJson(input, map);

  assertEqual(
    result.value,
    {
      options: [
        { id: "a", label: `<img src="/api/question-assets/${ASSET_ID_A}"/>` },
        { id: "b", label: "no image here" },
      ],
    },
    "nested arrays of objects: rewrite reaches strings inside array elements",
  );
}

// --- Multiple URLs in one string ---

{
  const input = { html: `<p><img src="${URL_A}"/><img src="${URL_B}"/></p>` };
  const map = new Map([
    [PATH_A, ASSET_ID_A],
    [PATH_B, ASSET_ID_B],
  ]);
  const result = rewriteQuestionAssetUrlsInJson(input, map);

  assertEqual(
    result.value.html,
    `<p><img src="/api/question-assets/${ASSET_ID_A}"/><img src="/api/question-assets/${ASSET_ID_B}"/></p>`,
    "multiple URLs in one string: both are rewritten independently",
  );
  assertEqual(result.replaced, 2, "multiple URLs in one string: replaced=2");
}

// --- Unresolved (unmapped) paths ---

{
  const input = { html: `<img src="${URL_A}"/>` };
  const emptyMap = new Map();
  const result = rewriteQuestionAssetUrlsInJson(input, emptyMap);

  assertEqual(
    result.value,
    input,
    "unresolved: JSON value is left byte-for-byte unchanged when unmapped",
  );
  assert(!result.changed, "unresolved: changed=false");
  assertEqual(result.replaced, 0, "unresolved: replaced=0");
  assertEqual(
    result.unmapped,
    [{ path: ["html"], url: URL_A, storagePath: PATH_A }],
    "unresolved: unmapped entry reports its JSON path, url, and storage path",
  );
}

{
  // Unresolved inside a nested array — path must reflect the full location.
  const input = { items: [{ html: `<img src="${URL_A}"/>` }] };
  const emptyMap = new Map();
  const result = rewriteQuestionAssetUrlsInJson(input, emptyMap);

  assertEqual(
    result.unmapped,
    [{ path: ["items", 0, "html"], url: URL_A, storagePath: PATH_A }],
    "unresolved in nested array: reported path includes array index and nested key",
  );
}

// --- Already-migrated routes are skipped ---

{
  const input = { html: `<img src="/api/question-assets/${ASSET_ID_A}"/>` };
  const map = new Map([[PATH_A, ASSET_ID_A]]);
  const result = rewriteQuestionAssetUrlsInJson(input, map);

  assertEqual(result.value, input, "already migrated: value is unchanged");
  assert(!result.changed, "already migrated: changed=false");
  assertEqual(result.replaced, 0, "already migrated: replaced=0");
  assertEqual(
    findLegacyQuestionAssetUrlsInJson(input),
    [],
    "already migrated: findLegacyQuestionAssetUrlsInJson finds nothing to migrate",
  );
}

// --- Repeated execution (idempotency) ---

{
  const input = {
    question: { html: `<img src="${URL_A}"/>`, tags: [`see ${URL_B}`, "static"] },
  };
  const map = new Map([
    [PATH_A, ASSET_ID_A],
    [PATH_B, ASSET_ID_B],
  ]);

  const first = rewriteQuestionAssetUrlsInJson(input, map);
  const second = rewriteQuestionAssetUrlsInJson(first.value, map);

  assertEqual(
    second.value,
    first.value,
    "idempotency: running the rewrite twice produces identical output the second time",
  );
  assert(!second.changed, "idempotency: second run reports changed=false");
  assertEqual(second.replaced, 0, "idempotency: second run replaces nothing further");
  assertEqual(second.unmapped, [], "idempotency: second run has no unmapped entries");
}

// --- Preservation of non-URL text and JSON structure ---

{
  const input = {
    z_last: "last key",
    a_first: "first key",
    count: 3,
    nested: { keep: "unchanged", list: [1, 2, 3] },
  };
  const result = rewriteQuestionAssetUrlsInJson(input, new Map());

  assertEqual(
    Object.keys(result.value),
    Object.keys(input),
    "structure preservation: key order is preserved exactly",
  );
  assertEqual(
    result.value,
    input,
    "structure preservation: a value with no legacy URLs is returned unchanged",
  );
  assert(!result.changed, "structure preservation: changed=false when nothing matched");
}

{
  // Non-URL text surrounding a URL, including punctuation/quotes, must survive.
  const input = {
    caption: `See figure ("${URL_A}") for details — units in cm.`,
  };
  const map = new Map([[PATH_A, ASSET_ID_A]]);
  const result = rewriteQuestionAssetUrlsInJson(input, map);

  assertEqual(
    result.value.caption,
    `See figure ("/api/question-assets/${ASSET_ID_A}") for details — units in cm.`,
    "structure preservation: non-URL text around a match is preserved exactly",
  );
}

// --- findLegacyQuestionAssetUrlsInJson (used for the bulk storage_path collection pass) ---

{
  const input = {
    a: `<img src="${URL_A}"/>`,
    list: [{ b: `<img src="${URL_B}"/>` }, "no url"],
  };
  assertEqual(
    findLegacyQuestionAssetUrlsInJson(input),
    [
      { path: ["a"], url: URL_A, storagePath: PATH_A },
      { path: ["list", 0, "b"], url: URL_B, storagePath: PATH_B },
    ],
    "findLegacyQuestionAssetUrlsInJson: collects every occurrence with its JSON path",
  );
}

assertEqual(
  findLegacyQuestionAssetUrlsInJson(null),
  [],
  "findLegacyQuestionAssetUrlsInJson: null value returns empty array",
);

assertEqual(
  findLegacyQuestionAssetUrlsInJson(42),
  [],
  "findLegacyQuestionAssetUrlsInJson: number value returns empty array",
);

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exitCode = 1;
}
