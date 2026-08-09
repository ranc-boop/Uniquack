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

const { composeProviderRequestV2 } = await import(
  "../src/lib/ai-pdf-import/v2/prompt-contract.ts"
);
const { FIXTURE_HASHES, buildDevelopmentFixture } = await import(
  "../test/support/ai-parsing-v2-fixtures.mjs"
);

const fixture = buildDevelopmentFixture("multiple_visuals");
const taxonomyCandidates = fixture.context.taxonomyCandidates
  .filter(
    (candidate) =>
      candidate.active && candidate.assignable && candidate.effectiveLeaf,
  )
  .map((candidate) => ({
    aliases: [],
    facet: candidate.facet,
    label: candidate.tagId,
    tagId: candidate.tagId,
  }));
const sourcePacket = {
  availablePageNumbers: [1, 2, 3, 4],
  packetRefs: [
    {
      packetHash: "9".repeat(64),
      packetId: "packet:synthetic",
      pageNumbers: [1, 2, 3, 4],
    },
  ],
  pageCount: 4,
  sourceAssetRef: "source:development",
  sourceKind: "pdf",
  visualMetadata: [
    {
      bbox: { height: 0.4, width: 0.6, x: 0.2, y: 0.2 },
      localRef: "visual-region-1",
      page: 2,
    },
    {
      bbox: { height: 0.2, width: 0.25, x: 0.65, y: 0.2 },
      localRef: "visual-region-2",
      page: 2,
    },
  ],
};
const fakeSource = [
  "Synthetic source packet for context-size measurement only.",
  "Question 1 uses one bounded graph and one bounded table.",
  "Answer key and concise worked solution appear on page 3.",
].join("\n");
const composed = composeProviderRequestV2({
  attemptReason: "initial",
  candidateSubsetSha256: FIXTURE_HASHES.candidate,
  sourceContent: fakeSource,
  sourcePacket,
  taxonomyCandidates,
  taxonomySnapshotSha256: FIXTURE_HASHES.taxonomy,
});
const v1SchemaBytes = Buffer.byteLength(
  fs.readFileSync(
    new URL(
      "../src/lib/ai-providers/gemini-ai-pdf-extraction.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
  "utf8",
);

console.log("AI_PARSING_V2_CONTEXT_SIZE_REPORT");
for (const [key, value] of Object.entries(composed.contextSize)) {
  console.log(`${key}=${value}`);
}
console.log(`v1ProviderSchemaFileBytes=${v1SchemaBytes}`);
console.log(
  `v2MinusV1ComparableSchemaBytes=${composed.contextSize.schemaBytes - v1SchemaBytes}`,
);
console.log("providerTokenCounts=NOT_MEASURED");
console.log("providerCalls=0");
console.log("hostedOperations=0");
