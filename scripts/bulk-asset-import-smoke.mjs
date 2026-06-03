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

const firstSelection = [
  {
    fileName: "Q1001_diagram.png",
    mimeType: "image/png",
    sizeBytes: 1024,
  },
];
const secondSelection = [
  ...firstSelection,
  {
    fileName: "Q1002_circuit.webp",
    mimeType: "image/webp",
    sizeBytes: 1024,
  },
];
const firstQueue = helper.classifyBulkAssetQueue({
  files: firstSelection,
  questions,
});
const accumulatedQueue = helper.classifyBulkAssetQueue({
  files: secondSelection,
  questions,
});
assert(
  firstQueue.length === 1 &&
    accumulatedQueue.length === 2 &&
    accumulatedQueue.every((item) => item.status === "matched"),
  "separate file picker selections can accumulate in the queue",
);

const queueDuplicate = helper.classifyBulkAssetQueue({
  files: [...firstSelection, ...firstSelection],
  questions,
});
assert(
  queueDuplicate[0].status === "matched" &&
    queueDuplicate[1].status === "duplicate" &&
    queueDuplicate[1].duplicateReason === "queue",
  "duplicate files in the current preview queue are skipped",
);

const existingImageIndex = helper.buildBulkAssetExistingFileIndex([
  {
    fileKind: "image",
    originalFilename: "Q1001_diagram.png",
    questionId: "question-1",
  },
]);
const duplicateExistingImage = helper.classifyBulkAssetFile({
  existingFilesByQuestionId: existingImageIndex,
  fileName: "Q1001_diagram.png",
  mimeType: "image/png",
  questions,
  sizeBytes: 1024,
});
assert(
  duplicateExistingImage.status === "duplicate" &&
    duplicateExistingImage.duplicateReason === "existing",
  "duplicate image already uploaded for the same question is skipped",
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

const existingPdfIndex = helper.buildBulkAssetExistingFileIndex([
  {
    fileKind: "pdf",
    objectPath: "questions/question-2/Q1002_source.pdf",
    questionId: "question-2",
  },
]);
const duplicateExistingPdf = helper.classifyBulkAssetFile({
  existingFilesByQuestionId: existingPdfIndex,
  fileName: "Q1002_source.pdf",
  mimeType: "application/pdf",
  questions,
  sizeBytes: 2048,
});
assert(
  duplicateExistingPdf.status === "duplicate" &&
    duplicateExistingPdf.duplicateReason === "existing",
  "duplicate PDF already uploaded for the same question is skipped",
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

const mixedQueue = helper.classifyBulkAssetQueue({
  existingFilesByQuestionId: existingImageIndex,
  files: [
    {
      fileName: "Q1001_diagram.png",
      mimeType: "image/png",
      sizeBytes: 1024,
    },
    {
      fileName: "NO_MATCH_diagram.gif",
      mimeType: "image/gif",
      sizeBytes: 1024,
    },
    {
      fileName: "Q1002_source.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
    },
  ],
  questions,
});
assert(
  mixedQueue.filter((item) => item.status === "matched").length === 1 &&
    mixedQueue.filter((item) => item.status === "duplicate").length === 1 &&
    mixedQueue.filter((item) => item.status === "unmatched").length === 1,
  "confirm upload eligibility excludes duplicate and unmatched files",
);

console.log("Bulk asset import smoke completed.");
