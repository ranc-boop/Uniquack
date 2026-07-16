// Static guardrail: fails if application code (src/) reintroduces a way to access
// the `question-assets` Storage bucket other than through the authorized route
// (/api/question-assets/[assetId]). This is the regression this check exists to
// catch — see docs/question-assets-maintenance.md.
//
// Wired into `npm run lint` (see package.json) so it runs on every lint pass, the
// same way scripts/check-math-content-usage.mjs already does for MathContent usage.
//
// Scope is deliberately narrow: only `src/` is scanned. Everything outside `src/`
// (migrations, backfill/verification scripts and their SQL, smoke tests, docs) is
// out of scope by directory, not by an allowlist — see "Exclusions" below for why
// each category is safe to leave unscanned, and the one narrow in-file exclusion
// mechanism used inside `src/` itself.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const scanRoot = "src";
const scanExtensions = [".ts", ".tsx"];

// A line containing this exact marker is exempt from every pattern below. This is
// the ONLY exclusion mechanism inside `src/` — it exists for the single doc comment
// in src/lib/storage/question-assets.ts that has to name the forbidden pattern in
// order to explain why it's forbidden. It is intentionally a substring match with no
// wildcard/regex power, so it can't be used to silently exempt an unrelated line;
// anyone adding this marker is visibly documenting an exception right where it lives.
const SUPPRESSION_MARKER = "guardrail-allow:question-assets-public-url";

// Real method-call syntax: `<something>.getPublicUrl(`. Anchored on a leading `.` so
// prose that merely *names* the method (without the leading dot) doesn't match —
// though in practice we still require callers to use SUPPRESSION_MARKER for any line
// that does contain the full call shape, since that's the actually dangerous pattern.
const GET_PUBLIC_URL_CALL = /\.getPublicUrl\s*\(/;

// The legacy public-object URL path segment for this bucket specifically. Matches
// both a bare path reference and a full hard-coded URL (any hard-coded URL for this
// bucket necessarily contains this substring), so one pattern covers both forbidden
// cases listed in the task: "the literal path" and "a hard-coded public URL".
const LEGACY_PUBLIC_PATH = /\/storage\/v1\/object\/public\/question-assets\b/;

function listSourceFiles(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (scanExtensions.some((ext) => path.endsWith(ext))) {
      files.push(path);
    }
  }

  return files;
}

const violations = [];

for (const file of listSourceFiles(join(root, scanRoot))) {
  const rel = relative(root, file).replaceAll("\\", "/");
  const lines = readFileSync(file, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.includes(SUPPRESSION_MARKER)) {
      return;
    }

    if (GET_PUBLIC_URL_CALL.test(line)) {
      violations.push({
        file: rel,
        line: index + 1,
        message:
          "Do not call .getPublicUrl() for question-assets. Use getQuestionAssetUrl(assetId) from @/lib/storage/question-assets and render through /api/question-assets/[assetId].",
      });
    }

    if (LEGACY_PUBLIC_PATH.test(line)) {
      violations.push({
        file: rel,
        line: index + 1,
        message:
          "Do not reference the legacy public question-assets Storage path (/storage/v1/object/public/question-assets). Use getQuestionAssetUrl(assetId) instead.",
      });
    }
  });
}

if (violations.length) {
  console.error("Question-assets public-URL guardrail failed:");
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} ${violation.message}`);
  }
  console.error(
    "\nSee docs/question-assets-maintenance.md for the required access pattern and how to fix this.",
  );
  process.exit(1);
}

console.log("Question-assets public-URL guardrail passed (src/ is clean).");
