// Pure logic for rewriting legacy public Supabase Storage URLs for question-assets
// into the authorized internal route path (/api/question-assets/{assetId}).
//
// No DB/network access here — this module only does string parsing and
// substitution, so it can be unit-tested without live credentials, and reused
// identically by both the backfill script and its tests.

// Matches: https://<any-host>/storage/v1/object/public/question-assets/<path>
// Captures <path>, which corresponds to question_assets.storage_path.
// Deliberately host-agnostic (no hardcoded project ref) since the Supabase URL is
// environment-specific and may differ between local/staging/production dumps.
export const LEGACY_QUESTION_ASSET_URL_PATTERN =
  /https?:\/\/[^\s"'<>]+\/storage\/v1\/object\/public\/question-assets\/([^\s"'<>]+)/g;

const LEGACY_QUESTION_ASSET_URL_CANDIDATE_PATTERN =
  /[^\s"'<>]*\/storage\/v1\/object\/public\/question-assets\/[^\s"'<>]*/g;

// Already-migrated content contains this prefix instead; used only for reporting/
// sanity checks, not for matching (the legacy pattern above naturally never matches
// already-migrated content, which is what makes re-running this script a no-op).
export const AUTHORIZED_QUESTION_ASSET_ROUTE_PREFIX = "/api/question-assets/";

/**
 * @param {string | null | undefined} html
 * @returns {{ url: string; storagePath: string }[]}
 */
export function findLegacyQuestionAssetUrls(html) {
  if (!html) {
    return [];
  }

  const matches = [];
  for (const match of html.matchAll(LEGACY_QUESTION_ASSET_URL_PATTERN)) {
    matches.push({ url: match[0], storagePath: match[1] });
  }
  return matches;
}

/**
 * Detect path fragments that look like a legacy public URL but are not a complete
 * http(s) URL. These are never rewritten by guesswork; --apply blocks until an
 * operator resolves them.
 *
 * @param {string | null | undefined} html
 * @returns {string[]}
 */
export function findMalformedLegacyQuestionAssetUrls(html) {
  if (!html) {
    return [];
  }

  const recognized = new Set(findLegacyQuestionAssetUrls(html).map((match) => match.url));
  const malformed = [];

  for (const match of html.matchAll(LEGACY_QUESTION_ASSET_URL_CANDIDATE_PATTERN)) {
    if (!recognized.has(match[0])) {
      malformed.push(match[0]);
    }
  }

  return malformed;
}

/**
 * Replace every legacy question-assets public URL in `html` with
 * `/api/question-assets/{assetId}`, using `assetIdByStoragePath` to resolve each
 * occurrence's storage_path to a question_assets.id. Occurrences that cannot be
 * resolved are left untouched (byte-for-byte) and reported in `unmapped`.
 *
 * Idempotent by construction: once an occurrence is replaced, the legacy pattern no
 * longer matches it, so a second call with the same input (post-replacement) finds
 * nothing left to do for that occurrence.
 *
 * @param {string | null | undefined} html
 * @param {Map<string, string>} assetIdByStoragePath
 * @returns {{ html: string | null | undefined; changed: boolean; replaced: number; unmapped: { url: string; storagePath: string }[] }}
 */
export function rewriteQuestionAssetUrls(html, assetIdByStoragePath) {
  if (!html) {
    return { html, changed: false, replaced: 0, unmapped: [] };
  }

  const unmapped = [];
  let replaced = 0;

  const nextHtml = html.replace(
    LEGACY_QUESTION_ASSET_URL_PATTERN,
    (fullMatch, storagePath) => {
      const assetId = assetIdByStoragePath.get(storagePath);

      if (!assetId) {
        unmapped.push({ url: fullMatch, storagePath });
        return fullMatch;
      }

      replaced += 1;
      return `${AUTHORIZED_QUESTION_ASSET_ROUTE_PREFIX}${assetId}`;
    },
  );

  return {
    html: nextHtml,
    changed: nextHtml !== html,
    replaced,
    unmapped,
  };
}

// The set of table/column pairs known to potentially embed question-asset URLs in
// plain HTML text. See docs/storage-url-backfill-report.md for the full audit,
// including JSONB columns intentionally excluded from this pass.
export const QUESTION_ASSET_HTML_TARGETS = [
  { table: "questions", column: "content_html" },
  { table: "questions", column: "solution_html" },
  { table: "question_rubric_steps", column: "content_html" },
  { table: "practice_round_questions", column: "content_html" },
  { table: "practice_attempts", column: "solution_html" },
];
