import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";

const helperPath = resolve("src/lib/bulk-asset-import/matching.ts");
const source = readFileSync(helperPath, "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
});
const helper = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS ${message}`);
}

const questions = [
  {
    id: "question-1",
    questionCode: "Q1001",
    title: "Draft diagram question",
  },
  {
    id: "question-2",
    questionCode: "Q1002",
    title: "Draft source question",
  },
  {
    id: "question-3",
    questionCode: "ASSET_MULTI_101",
    title: "Draft underscore question",
  },
  {
    id: "question-4",
    questionCode: "ASSET_MULTI",
    title: "Draft ambiguous prefix question",
  },
];

const image = helper.classifyBulkAssetFile({
  fileName: "Q1001_diagram.png",
  mimeType: "image/png",
  questions,
  sizeBytes: 1024,
});
assert(
  image.status === "matched" &&
    image.fileKind === "image" &&
    image.matchedQuestion?.questionCode === "Q1001",
  "image filename routes toward question_assets",
);

const pdf = helper.classifyBulkAssetFile({
  fileName: "Q1002_source.pdf",
  mimeType: "application/pdf",
  questions,
  sizeBytes: 2048,
});
assert(
  pdf.status === "matched" &&
    pdf.fileKind === "pdf" &&
    pdf.matchedQuestion?.questionCode === "Q1002",
  "PDF filename routes toward question_source_files",
);

const underscoreCode = helper.classifyBulkAssetFile({
  fileName: "ASSET_MULTI_101_cart.webp",
  mimeType: "image/webp",
  questions: questions.filter((question) => question.questionCode !== "ASSET_MULTI"),
  sizeBytes: 1024,
});
assert(
  underscoreCode.status === "matched" &&
    underscoreCode.matchedQuestion?.questionCode === "ASSET_MULTI_101",
  "underscore question-code prefixes match the full question code",
);

const ambiguousCode = helper.classifyBulkAssetFile({
  fileName: "ASSET_MULTI_101_cart.webp",
  mimeType: "image/webp",
  questions,
  sizeBytes: 1024,
});
assert(
  ambiguousCode.status === "ambiguous" &&
    ambiguousCode.matchedQuestions.length === 2,
  "overlapping question-code prefixes are reported as ambiguous",
);

const unmatched = helper.classifyBulkAssetFile({
  fileName: "NO_MATCH_diagram.gif",
  mimeType: "image/gif",
  questions,
  sizeBytes: 1024,
});
assert(unmatched.status === "unmatched", "unmatched files are reported safely");

const svg = helper.classifyBulkAssetFile({
  fileName: "Q1001_diagram.svg",
  mimeType: "image/svg+xml",
  questions,
  sizeBytes: 1024,
});
assert(svg.status === "invalid", "SVG files are rejected");

const textFile = helper.classifyBulkAssetFile({
  fileName: "Q1001_notes.txt",
  mimeType: "text/plain",
  questions,
  sizeBytes: 1024,
});
assert(textFile.status === "invalid", "non-image and non-PDF files are rejected");

const oversizedImage = helper.classifyBulkAssetFile({
  fileName: "Q1001_large.png",
  mimeType: "image/png",
  questions,
  sizeBytes: helper.BULK_ASSET_IMAGE_MAX_BYTES + 1,
});
assert(oversizedImage.status === "invalid", "oversized images are rejected");

console.log("Bulk asset import smoke completed.");
