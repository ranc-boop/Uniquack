import { createHash } from "node:crypto";

import { buildSyntheticVisualEvidencePdf } from "./synthetic-visual-pdf.mjs";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function textPage(lines) {
  return [
    "BT",
    "/F1 12 Tf",
    "18 TL",
    "54 738 Td",
    ...lines.flatMap((line, index) => [
      ...(index ? ["T*"] : []),
      `(${escapePdfText(line)}) Tj`,
    ]),
    "ET",
  ].join("\n");
}

function assemblePdf(pageStreams) {
  const pageObjectNumbers = pageStreams.map((_, index) => 3 + index * 2);
  const fontObjectNumber = 3 + pageStreams.length * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers
      .map((number) => `${number} 0 R`)
      .join(" ")}] /Count ${pageStreams.length} >>`,
  ];

  for (const [index, stream] of pageStreams.entries()) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${4 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

const sourceBuilders = Object.freeze({
  "answer-key": () => assemblePdf([
    textPage([
      "Question 1",
      "If 3x + 2 = 14, what is x?",
      "A) 2   B) 4   C) 5   D) 6",
    ]),
    textPage([
      "Question 2",
      "If y = 2x + 1 and x = 3, what is y?",
      "A) 5   B) 6   C) 7   D) 8",
    ]),
    textPage([
      "This page intentionally contains explanatory reading but no question.",
    ]),
    textPage([
      "Answer Key",
      "Question 1: B. Solving 3x + 2 = 14 gives x = 4.",
      "Question 2: C. Substituting x = 3 gives y = 7.",
    ]),
  ]),
  equation: () => assemblePdf([
    textPage([
      "Question 1",
      "Differentiate f(x) = x^2.",
      "Answer: 2x.",
      "Question 2",
      "Find the indefinite integral of 1/x for x not equal to zero.",
      "Answer: ln|x| + C.",
    ]),
  ]),
  "insufficient-evidence": () => assemblePdf([
    textPage([
      "Study note",
      "A complete worked example should include the original question and all required data.",
      "The original question is intentionally absent from this rights-safe fixture.",
      "Do not invent a question or answer from this page.",
    ]),
  ]),
  "taxonomy-ambiguous": () => assemblePdf([
    textPage([
      "Question 1",
      "Solve x + 7 = 12 and explain the inverse operation used.",
      "Answer: x = 5.",
      "The source does not name a course, grade, standards framework, or exam.",
    ]),
  ]),
  "text-free-response": () => assemblePdf([
    textPage([
      "Question 1",
      "A box contains 2 red counters and 4 blue counters.",
      "How many counters are in the box? Explain your calculation.",
      "Answer: 6 counters because 2 + 4 = 6.",
    ]),
  ]),
  "visual-evidence": () => buildSyntheticVisualEvidencePdf(),
});

export const AI_PARSING_PROVIDER_BENCHMARK_V1_SOURCE_IDS = Object.freeze(
  Object.keys(sourceBuilders).sort(),
);

export function buildAIParsingProviderBenchmarkV1Source(sourceId) {
  const builder = sourceBuilders[sourceId];
  if (!builder) {
    throw new Error(`Unknown AI Parsing Provider Benchmark V1 source: ${sourceId}`);
  }
  return builder();
}

export function fingerprintAIParsingProviderBenchmarkV1Source(sourceId) {
  const bytes = buildAIParsingProviderBenchmarkV1Source(sourceId);
  return {
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sourceId,
  };
}
