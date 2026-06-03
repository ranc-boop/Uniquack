import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";

const outDir = resolve(".tools/package-import-smoke");
mkdirSync(outDir, { recursive: true });

function compileTs(sourcePath, outFile, rewrite = (value) => value) {
  const source = rewrite(readFileSync(sourcePath, "utf8"));
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const outPath = resolve(outDir, outFile);
  writeFileSync(outPath, outputText);
  return outPath;
}

compileTs("src/lib/bulk-asset-import/matching.ts", "matching.mjs");
compileTs("src/lib/package-import/zip.ts", "zip.mjs");
const packageModulePath = compileTs(
  "src/lib/package-import/package.ts",
  "package.mjs",
  (source) =>
    source
      .replaceAll("@/lib/bulk-asset-import/matching", "./matching.mjs")
      .replaceAll("@/lib/package-import/zip", "./zip.mjs"),
);

const zip = await import(`file://${resolve(outDir, "zip.mjs").replaceAll("\\", "/")}`);
const pkg = await import(
  `file://${packageModulePath.replaceAll("\\", "/")}`
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS ${message}`);
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function makeZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const data = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(file.data, "utf8");
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(data.length),
      uint32(data.length),
      uint16(name.length),
      uint16(0),
      name,
    ]);
    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(data.length),
      uint32(data.length),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      name,
    ]);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const localData = Buffer.concat(localParts);
  const eocd = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralDirectory.length),
    uint32(localData.length),
    uint16(0),
  ]);

  return Buffer.concat([localData, centralDirectory, eocd]);
}

async function plan(files) {
  const buffer = makeZip(files);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  const entries = await zip.readZipEntries(arrayBuffer);
  const questionEntry = entries.find(
    (entry) => pkg.normalizePackagePath(entry.path) === "questions.json",
  );
  const questionJsonText = questionEntry ? zip.zipEntryText(questionEntry) : null;
  const rawQuestions = questionJsonText
    ? pkg.parsePackageQuestionsJson(questionJsonText)
    : [];

  return pkg.planPackageImport({
    entries,
    questionJsonText,
    rawQuestions,
  });
}

const questionsJson = JSON.stringify([
  {
    code: "Q1001",
    title: "Package import smoke",
    type: "frq",
    difficulty: 500,
    tag_slugs: ["ap-physics"],
    content_html: "<p>ok</p>",
    solution_html: "<p>solution</p>",
    image_files: ["images/Q1001_diagram.png"],
    source_files: ["pdfs/Q1001_source.pdf"],
  },
]);

const validPlan = await plan([
  { path: "questions.json", data: questionsJson },
  { path: "images/Q1001_diagram.png", data: Buffer.from([137, 80, 78, 71]) },
  { path: "pdfs/Q1001_source.pdf", data: Buffer.from("%PDF-1.7") },
  { path: "images/unused.gif", data: Buffer.from("GIF89a") },
]);

assert(!validPlan.errors.length, "valid package has no fatal package errors");
assert(validPlan.questions.length === 1, "questions.json array is parsed");
assert(validPlan.counts.matchedImages === 1, "referenced image file is matched");
assert(validPlan.counts.matchedPdfs === 1, "referenced PDF file is matched");
assert(validPlan.counts.unusedFiles === 1, "unused package files are detected");

const missingQuestionsPlan = await plan([
  { path: "images/Q1001_diagram.png", data: Buffer.from([1, 2, 3]) },
]);
assert(
  missingQuestionsPlan.errors.includes("Missing questions.json."),
  "missing questions.json is rejected",
);

const unsafePathPlan = await plan([
  { path: "questions.json", data: "[]" },
  { path: "../evil.png", data: Buffer.from([1]) },
]);
assert(
  unsafePathPlan.counts.invalidFiles === 1 &&
    unsafePathPlan.assetPlans[0].message.includes("Unsafe ZIP path"),
  "unsafe path traversal entries are rejected",
);

const unsupportedPlan = await plan([
  { path: "questions.json", data: "[]" },
  { path: "images/Q1001_diagram.svg", data: "<svg />" },
]);
assert(unsupportedPlan.counts.invalidFiles === 1, "SVG files are rejected");

const duplicatePlan = await plan([
  { path: "questions.json", data: questionsJson },
  { path: "images/Q1001_diagram.png", data: Buffer.from([1]) },
  { path: "images/Q1001_diagram.png", data: Buffer.from([2]) },
]);
assert(
  duplicatePlan.counts.duplicateAssets === 1,
  "duplicate asset filenames are detected",
);

const missingRefPlan = await plan([
  { path: "questions.json", data: questionsJson },
]);
assert(
  missingRefPlan.counts.missingReferencedFiles === 2,
  "missing referenced image and PDF files are detected",
);

assert(
  pkg.parsePackageQuestionsJson(JSON.stringify({ questions: [] })).length === 0,
  "object with questions array is supported",
);

try {
  pkg.parsePackageQuestionsJson("{");
  throw new Error("invalid JSON unexpectedly parsed");
} catch {
  console.log("PASS invalid questions.json is rejected");
}

console.log("Package import smoke completed.");
