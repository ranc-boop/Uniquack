import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export%20{}",
      };
    }
    if (specifier.startsWith("@/")) {
      const url = new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url);
      if (fs.existsSync(fileURLToPath(url))) {
        return { shortCircuit: true, url: url.href };
      }
    }
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\.[A-Za-z0-9]+$/.test(specifier)
    ) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (fs.existsSync(fileURLToPath(url))) {
        return { shortCircuit: true, url: url.href };
      }
    }
    return nextResolve(specifier, context);
  },
});

const { AI_PARSING_V2_PROMPT_FINGERPRINTS } = await import(
  "../src/lib/ai-pdf-import/v2/prompt-contract.ts"
);
const { sha256CanonicalJsonV2, sha256NormalizedTextV2 } = await import(
  "../src/lib/ai-pdf-import/v2/fingerprint.ts"
);

function readText(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const developmentText = readText(
  "../test/fixtures/ai-parsing-v2-development-corpus.json",
);
const holdoutText = readText(
  "../test/fixtures/ai-parsing-v2-frozen-holdout.json",
);
const expected = JSON.parse(
  readText("../test/fixtures/ai-parsing-v2-foundation-fingerprints.json"),
);

const current = {
  version: "ai_parsing_v2_foundation_fingerprints_v1",
  developmentCorpus: {
    canonicalJsonSha256: sha256CanonicalJsonV2(JSON.parse(developmentText)),
    normalizedTextSha256: sha256NormalizedTextV2(developmentText),
  },
  frozenHoldout: {
    canonicalJsonSha256: sha256CanonicalJsonV2(JSON.parse(holdoutText)),
    normalizedTextSha256: sha256NormalizedTextV2(holdoutText),
  },
  providerContract: AI_PARSING_V2_PROMPT_FINGERPRINTS,
};

if (process.argv.includes("--print-current")) {
  process.stdout.write(`${JSON.stringify(current, null, 2)}\n`);
  process.exit(0);
}

assert.deepEqual(current, expected);

console.log("AI_PARSING_V2_FOUNDATION_FINGERPRINTS=PASS");
console.log("PROVIDER_CALLS=0");
console.log("HOSTED_OPERATIONS=0");
