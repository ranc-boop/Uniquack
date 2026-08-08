const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

export const syntheticVisualQuestionContract = Object.freeze({
  decorativeQuestionNumber: "2",
  missingVisualQuestionNumber: "3",
  requiredDiagramQuestionNumber: "1",
  sharedVisualQuestionNumber: "4",
});

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function textBlock(lines, { leading = 18, size = 12, x = 54, y = 738 } = {}) {
  return [
    "BT",
    `/F1 ${size} Tf`,
    `${leading} TL`,
    `${x} ${y} Td`,
    ...lines.flatMap((line, index) => [
      ...(index ? ["T*"] : []),
      `(${escapePdfText(line)}) Tj`,
    ]),
    "ET",
  ].join("\n");
}

function pageOneStream() {
  const grid = [];
  for (let offset = 0; offset <= 240; offset += 40) {
    grid.push(`180 ${250 + offset} m 420 ${250 + offset} l S`);
    grid.push(`${180 + offset} 250 m ${180 + offset} 490 l S`);
  }
  return [
    textBlock([
      "Question 1",
      "Use the coordinate diagram shown below.",
      "The line passes through the labeled points (0, 1) and (2, 5).",
      "What is the slope of the line?",
      "A) 1   B) 2   C) 3   D) 4",
      "Answer: B",
      "Explanation: (5 - 1) / (2 - 0) = 2.",
    ]),
    "q",
    "0.94 0.97 1 rg",
    "150 215 300 310 re f",
    "0.65 0.72 0.82 RG",
    "0.5 w",
    ...grid,
    "0.05 0.18 0.32 RG",
    "1.5 w",
    "180 250 m 180 500 l S",
    "165 370 m 440 370 l S",
    "0.95 0.62 0.08 RG",
    "4 w",
    "180 290 m 420 450 l S",
    "0.05 0.18 0.32 rg",
    "176 286 9 9 re f",
    "416 446 9 9 re f",
    "Q",
    textBlock(
      [
        "REQUIRED DIAGRAM FOR QUESTION 1",
        "(0, 1)",
        "(2, 5)",
      ],
      { leading: 95, size: 10, x: 188, y: 510 },
    ),
  ].join("\n");
}

function pageTwoStream() {
  return [
    textBlock([
      "Question 2",
      "Find the derivative of f(x) = x^3.",
      "A) x^2   B) 2x   C) 3x^2   D) 3x",
      "Answer: C",
      "Explanation: The power rule gives f'(x) = 3x^2.",
      "The visual banner at the bottom is decorative and is not question evidence.",
    ]),
    "q",
    "0.05 0.18 0.32 rg",
    "70 135 472 145 re f",
    "0.95 0.62 0.08 rg",
    "110 175 m 125 215 l 140 175 l 180 175 l 148 150 l 160 112 l 125 135 l 90 112 l 102 150 l 70 175 l h f",
    "0.18 0.68 0.62 rg",
    "442 175 m 457 215 l 472 175 l 512 175 l 480 150 l 492 112 l 457 135 l 422 112 l 434 150 l 402 175 l h f",
    "Q",
    textBlock(
      ["DECORATIVE COURSE BANNER", "NOT PART OF ANY QUESTION"],
      { leading: 20, size: 16, x: 184, y: 205 },
    ),
  ].join("\n");
}

function pageThreeStream() {
  return textBlock([
    "Question 3",
    "Use the diagram shown below to determine the shaded area.",
    "A) 8 square units   B) 12 square units",
    "C) 16 square units  D) Insufficient evidence",
    "Answer: D",
    "Explanation: The referenced diagram is intentionally absent, so the area cannot be determined.",
    "SOURCE NOTE: FIGURE 3 IS INTENTIONALLY MISSING FROM THIS PAGE.",
  ]);
}

function pageFourStream() {
  return [
    textBlock([
      "Question 4 (parts a and b)",
      "Use the shared table shown below for both parts.",
      "(a) Find the constant rate of change of f.",
      "(b) Use that same rate to find f(4).",
      "Answer: (a) 2; (b) 9.",
      "Explanation: f increases by 2 for each increase of 1 in x.",
    ]),
    "q",
    "0.94 0.97 1 rg",
    "130 245 352 250 re f",
    "0.05 0.18 0.32 RG",
    "2 w",
    "150 285 312 160 re S",
    "228 285 m 228 445 l S",
    "306 285 m 306 445 l S",
    "384 285 m 384 445 l S",
    "150 365 m 462 365 l S",
    "Q",
    textBlock(
      ["SHARED REQUIRED TABLE FOR QUESTION 4(a) AND 4(b)"],
      { size: 11, x: 150, y: 472 },
    ),
    textBlock(["x", "f(x)"], { leading: 80, size: 14, x: 178, y: 410 }),
    textBlock(["0", "1"], { leading: 80, size: 14, x: 260, y: 410 }),
    textBlock(["1", "3"], { leading: 80, size: 14, x: 338, y: 410 }),
    textBlock(["2", "5"], { leading: 80, size: 14, x: 416, y: 410 }),
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

export function buildSyntheticVisualEvidencePdf() {
  return assemblePdf([
    pageOneStream(),
    pageTwoStream(),
    pageThreeStream(),
    pageFourStream(),
  ]);
}
