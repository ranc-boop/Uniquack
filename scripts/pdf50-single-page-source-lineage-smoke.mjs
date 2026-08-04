import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = await readFile(
  resolve(root, "src/lib/ai-pdf-import/source-lineage.ts"),
  "utf8",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: "source-lineage.ts",
}).outputText;
const lineage = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
);

function extraction(pageRefs = []) {
  return {
    questions: [
      {
        answer_spec: {},
        asset_placeholders: [],
        content_html: "<p>Question</p>",
        difficulty_rating: 500,
        options: [],
        page_refs: pageRefs,
        question_type: "frq",
        solution_html: null,
        tag_ids: [],
        title: "Question",
      },
    ],
    warnings: [],
  };
}

const missingSinglePage = extraction();
const inferred = lineage.ensureSinglePageExtractionLineage({
  extraction: missingSinglePage,
  suppliedPageCount: 1,
});
assert(
  inferred.questions[0].page_refs.length === 1 &&
    inferred.questions[0].page_refs[0] === 1,
  "a one-page source must receive deterministic page lineage",
);
assert(
  inferred.warnings.includes(lineage.AI_PDF_SINGLE_PAGE_LINEAGE_WARNING),
  "inferred lineage must remain auditable",
);
assert(
  missingSinglePage.questions[0].page_refs.length === 0,
  "lineage inference must not mutate Provider output",
);

const existing = extraction([4]);
assert(
  lineage.ensureSinglePageExtractionLineage({
    extraction: existing,
    suppliedPageCount: 1,
  }) === existing,
  "existing Provider lineage must be preserved exactly",
);

const ambiguous = extraction();
assert(
  lineage.ensureSinglePageExtractionLineage({
    extraction: ambiguous,
    suppliedPageCount: 2,
  }) === ambiguous && ambiguous.questions[0].page_refs.length === 0,
  "multi-page missing lineage must remain unresolved for coverage review",
);

const service = await readFile(
  resolve(root, "src/lib/ai-pdf-import/service.ts"),
  "utf8",
);
const harness = await readFile(
  resolve(root, "scripts/pdf50-end-to-end-live-e2e.mjs"),
  "utf8",
);
assert(
  (service.match(/ensureSinglePageExtractionLineage\(\{/g) ?? []).length === 3,
  "single-pass, segmented, and recovery extraction paths must apply the same lineage rule",
);
assert(
  harness.includes("canonical_page_1_lineage") &&
    harness.includes("metadata.page_refs.length === 1") &&
    harness.includes("metadata.page_refs[0] === 1"),
  "the live proof must verify persisted page lineage",
);

console.log("PASS PDF50 deterministic single-page source lineage smoke");
