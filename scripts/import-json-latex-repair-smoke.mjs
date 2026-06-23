import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync("src/lib/import-json/latex-repair.ts", "utf8")
  .replace(/export /g, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleBody = compiled
  + "\nexport { parseImportJsonWithLatexRepair, repairLatexBackslashesInJsonStrings };";
const moduleUrl = "data:text/javascript;base64,"
  + Buffer.from(moduleBody).toString("base64");
const {
  parseImportJsonWithLatexRepair,
  repairLatexBackslashesInJsonStrings,
} = await import(moduleUrl);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const rawSingleBackslash = [
  "{",
  '  "questions": [',
  "    {",
  '      "code": "Q1",',
  '      "content_html": "<p>Compute $\\int_0^1 \\theta^2 dx$ and $\\frac{1}{2}$.</p>",',
  '      "solution_html": "<p>Use \\begin{aligned} a&=b \\end{aligned}.</p>"',
  "    }",
  "  ]",
  "}",
].join("\n");
const parsedSingle = parseImportJsonWithLatexRepair(rawSingleBackslash);
const singleContent = parsedSingle.questions[0].content_html;
const singleSolution = parsedSingle.questions[0].solution_html;

assert(singleContent.includes("\\int_0^1"), "Expected \\int to survive.");
assert(singleContent.includes("\\theta^2"), "Expected \\theta to survive.");
assert(singleContent.includes("\\frac{1}{2}"), "Expected \\frac to survive.");
assert(singleSolution.includes("\\begin{aligned}"), "Expected \\begin to survive.");

const alreadyEscaped =
  '{"questions":[{"code":"Q2","content_html":"<p>$\\\\theta + \\\\frac{1}{2}$</p>"}]}';
const parsedEscaped = parseImportJsonWithLatexRepair(alreadyEscaped);

assert(
  parsedEscaped.questions[0].content_html.includes("\\theta + \\frac{1}{2}"),
  "Already escaped LaTeX should not be double-repaired.",
);

const normalJsonEscapes =
  '{"questions":[{"code":"Q3","content_html":"line\\nnext","title":"Unicode \\u03b8"}]}';
const repairedNormal = repairLatexBackslashesInJsonStrings(normalJsonEscapes);
const parsedNormal = JSON.parse(repairedNormal);

assert(
  parsedNormal.questions[0].content_html === "line" + String.fromCharCode(10) + "next",
  "Expected normal newline escape.",
);
assert(parsedNormal.questions[0].title === "Unicode θ", "Expected unicode escape.");

console.log("import-json-latex-repair smoke passed");
