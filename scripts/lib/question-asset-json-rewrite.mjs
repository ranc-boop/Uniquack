// JSON-aware version of question-asset-url-rewrite.mjs, for JSONB columns that may
// embed legacy question-assets public URLs inside nested string values (not as a
// plain HTML text column).
//
// This module NEVER serializes the JSON value to text and regex-replaces the whole
// blob. It recursively walks the parsed JS value (object/array/string/number/
// boolean/null — exactly what supabase-js already hands back for a jsonb column)
// and only ever calls the string-level rewrite on individual string leaves, via the
// same LEGACY_QUESTION_ASSET_URL_PATTERN / rewriteQuestionAssetUrls used for plain
// HTML columns in Commit 1. This guarantees identical matching/replacement
// semantics between the two backfills, and guarantees every non-string JSON value
// (numbers, booleans, null, key names, array order, object shape) is structurally
// preserved exactly — only string leaf *content* can change, and only in the exact
// substring span of a matched URL.

import {
  findMalformedLegacyQuestionAssetUrls,
  findLegacyQuestionAssetUrls,
  rewriteQuestionAssetUrls,
} from "./question-asset-url-rewrite.mjs";

/**
 * Recursively collect every legacy URL occurrence anywhere in a JSON value, with a
 * JSON-pointer-style path (array of string/number segments) locating each string.
 *
 * @param {unknown} value
 * @param {(string | number)[]} path
 * @returns {{ path: (string | number)[]; url: string; storagePath: string }[]}
 */
export function findLegacyQuestionAssetUrlsInJson(value, path = []) {
  if (typeof value === "string") {
    return findLegacyQuestionAssetUrls(value).map((match) => ({
      path,
      url: match.url,
      storagePath: match.storagePath,
    }));
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findLegacyQuestionAssetUrlsInJson(item, [...path, index]),
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entryValue]) =>
      findLegacyQuestionAssetUrlsInJson(entryValue, [...path, key]),
    );
  }

  // number, boolean, null, undefined: no strings to inspect.
  return [];
}

export function findMalformedLegacyQuestionAssetUrlsInJson(value, path = []) {
  if (typeof value === "string") {
    return findMalformedLegacyQuestionAssetUrls(value).map((url) => ({ path, url }));
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findMalformedLegacyQuestionAssetUrlsInJson(item, [...path, index]),
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entryValue]) =>
      findMalformedLegacyQuestionAssetUrlsInJson(entryValue, [...path, key]),
    );
  }

  return [];
}

/**
 * Recursively rewrite every legacy question-assets URL found anywhere inside a JSON
 * value into `/api/question-assets/{assetId}`, using `assetIdByStoragePath` to
 * resolve each occurrence. Returns a NEW value (never mutates the input); numbers,
 * booleans, null, key names, key order, and array order are always preserved
 * exactly. Non-URL text within a string is preserved exactly (only the matched URL
 * substrings are replaced, same as the plain-HTML rewriter).
 *
 * @param {unknown} value
 * @param {Map<string, string>} assetIdByStoragePath
 * @param {(string | number)[]} path
 * @returns {{ value: unknown; changed: boolean; replaced: number; unmapped: { path: (string|number)[]; url: string; storagePath: string }[] }}
 */
export function rewriteQuestionAssetUrlsInJson(value, assetIdByStoragePath, path = []) {
  if (typeof value === "string") {
    const result = rewriteQuestionAssetUrls(value, assetIdByStoragePath);
    return {
      value: result.html,
      changed: result.changed,
      replaced: result.replaced,
      unmapped: result.unmapped.map((entry) => ({ path, ...entry })),
    };
  }

  if (Array.isArray(value)) {
    let changed = false;
    let replaced = 0;
    const unmapped = [];
    const nextArray = value.map((item, index) => {
      const result = rewriteQuestionAssetUrlsInJson(item, assetIdByStoragePath, [
        ...path,
        index,
      ]);
      changed = changed || result.changed;
      replaced += result.replaced;
      unmapped.push(...result.unmapped);
      return result.value;
    });

    return { value: nextArray, changed, replaced, unmapped };
  }

  if (value && typeof value === "object") {
    let changed = false;
    let replaced = 0;
    const unmapped = [];
    const nextObject = {};

    // Object.entries preserves insertion (key) order, which we rebuild identically.
    for (const [key, entryValue] of Object.entries(value)) {
      const result = rewriteQuestionAssetUrlsInJson(entryValue, assetIdByStoragePath, [
        ...path,
        key,
      ]);
      changed = changed || result.changed;
      replaced += result.replaced;
      unmapped.push(...result.unmapped);
      nextObject[key] = result.value;
    }

    return { value: nextObject, changed, replaced, unmapped };
  }

  // number, boolean, null, undefined: returned as-is, untouched.
  return { value, changed: false, replaced: 0, unmapped: [] };
}

// The set of table/column pairs known to hold JSONB values that may embed
// question-asset URLs as nested string values. See
// docs/storage-url-backfill-report.md for the audit that produced this list.
export const QUESTION_ASSET_JSONB_TARGETS = [
  { table: "practice_round_questions", column: "question_snapshot" },
  { table: "practice_attempts", column: "question_snapshot" },
  { table: "practice_wrong_questions", column: "question_snapshot" },
  { table: "review_draft_items", column: "draft_payload" },
];
