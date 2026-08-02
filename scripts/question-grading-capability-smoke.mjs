import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function moduleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function transpile(source, fileName) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  }).outputText;
}

const answerSpecSource = transpile(
  await readFile(resolve(root, "src/lib/questions/answer-spec.ts"), "utf8"),
  "answer-spec.ts",
).replace(
  'import { AI_INPUT_LIMITS } from "@/lib/ai-input-limits";',
  "const AI_INPUT_LIMITS = new Proxy({}, { get: () => 10000 });",
);
const answerSpecUrl = moduleUrl(answerSpecSource);

const capabilitySource = transpile(
  await readFile(resolve(root, "src/lib/questions/grading-capability.ts"), "utf8"),
  "grading-capability.ts",
).replace('from "@/lib/questions/answer-spec"', `from "${answerSpecUrl}"`);
const capabilityUrl = moduleUrl(capabilitySource);
const capability = await import(capabilityUrl);

const gradingSource = transpile(
  await readFile(resolve(root, "src/lib/practice/grading.ts"), "utf8"),
  "grading.ts",
)
  .replace('import "server-only";', "")
  .replace('from "@/lib/questions/answer-spec"', `from "${answerSpecUrl}"`)
  .replace('from "@/lib/questions/grading-capability"', `from "${capabilityUrl}"`);
const grading = await import(moduleUrl(gradingSource));

const options = [
  { content_html: "One", id: "A", label: "A" },
  { content_html: "Two", id: "B", label: "B" },
];

assert(
  capability.getQuestionGradingCapability({
    answerSpec: { correct_option_ids: ["B"], kind: "mcq" },
    options,
    questionType: "mcq",
  }) === "deterministic",
  "configured MCQ must use deterministic grading",
);
assert(
  capability.getQuestionGradingCapability({
    answerSpec: { kind: "frq" },
    options,
    questionType: "mcq",
  }) === "needs_configuration",
  "MCQ with a mismatched or missing answer key must be blocked",
);
assert(
  capability.getQuestionGradingCapability({
    answerSpec: { accepted_answers: ["5"], kind: "fill_blank" },
    questionType: "fill_blank",
  }) === "deterministic",
  "configured fill blank must use deterministic grading",
);
assert(
  capability.getQuestionGradingCapability({
    answerSpec: { kind: "frq" },
    questionType: "frq",
    solutionHtml: "<p>Rubric evidence</p>",
  }) === "ai_review",
  "FRQ with a rubric must use AI review",
);
assert(
  capability.getQuestionGradingCapability({
    answerSpec: { kind: "frq" },
    questionType: "frq",
  }) === "needs_configuration",
  "FRQ without a solution or rubric must be blocked",
);

const invalidMcqGrade = grading.gradePracticeAttempt({
  attempt: { answer: [], questionId: "invalid-mcq" },
  question: {
    answer_spec: { kind: "frq" },
    id: "invalid-mcq",
    options,
    question_type: "mcq",
    solution_html: null,
    solution_source: null,
  },
});
assert(
  invalidMcqGrade.gradingCapability === "needs_configuration" &&
    invalidMcqGrade.isCorrect === null,
  "an unconfigured MCQ must never auto-grade an empty answer as correct",
);

const validMcqGrade = grading.gradePracticeAttempt({
  attempt: { answer: "B", questionId: "valid-mcq" },
  question: {
    answer_spec: { correct_option_ids: ["B"], kind: "mcq" },
    id: "valid-mcq",
    options,
    question_type: "mcq",
    solution_html: "<p>B is correct.</p>",
    solution_source: null,
  },
});
assert(
  validMcqGrade.gradingCapability === "deterministic" &&
    validMcqGrade.isCorrect === true,
  "configured MCQ must grade correctly without AI",
);

const client = await readFile(
  resolve(root, "src/components/practice/practice-agent-client.tsx"),
  "utf8",
);
const [gradeRoute, reviewRoute] = await Promise.all([
  readFile(resolve(root, "src/app/api/practice/grade/route.ts"), "utf8"),
  readFile(resolve(root, "src/app/api/practice/review/route.ts"), "utf8"),
]);
assert(
  client.indexOf('jsonRequest<PracticeGradeResponse>("/api/practice/grade"') <
    client.indexOf("await postReviewStream({"),
  "round submission must persist deterministic grading before AI review",
);
assert(
  gradeRoute.includes("body.deferCompletion === true") &&
    gradeRoute.indexOf("body.deferCompletion === true") <
      gradeRoute.indexOf("updateLinkedAssignmentProgressAfterPractice({"),
  "deterministic preflight grading must not complete linked Assignments",
);
assert(
  reviewRoute.indexOf("await persistRoundReviewSummary({") <
    reviewRoute.indexOf("await updateLinkedAssignmentProgressAfterPractice({"),
  "Assignment completion must happen only after the round review is durably finalized",
);
assert(
  (client.match(/jsonRequest<PracticeGradeResponse>\("\/api\/practice\/grade"/g) ?? []).length === 1 &&
    client.includes("const grade = deterministicGrade"),
  "AI review fallback must reuse the first deterministic result without overwriting reviewed scores",
);

console.log("PASS question readiness and deterministic-first practice grading");
