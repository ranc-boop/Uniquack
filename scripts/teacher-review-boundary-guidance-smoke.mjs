import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const [component, guidance, questionBanks, reviewPage, smokeAll] =
  await Promise.all([
    read("src/components/teacher/teacher-review-guidance.tsx"),
    read("src/lib/questions/teacher-review-guidance.ts"),
    read("src/lib/question-banks.ts"),
    read("src/app/teacher/banks/[bankId]/review/page.tsx"),
    read("scripts/smoke-all.mjs"),
  ]);

function hasReachableGuidancePath({ loaderSource, pageSource }) {
  return (
    loaderSource.includes("listBankReviewQuestionSummaries") &&
    loaderSource.includes("questionBoundaryFindingsForQuestion") &&
    loaderSource.includes("buildTeacherReviewGuidance") &&
    loaderSource.includes("reviewGuidance: buildTeacherReviewGuidance") &&
    pageSource.includes("TeacherReviewGuidance") &&
    pageSource.includes("question.reviewGuidance")
  );
}

assert(
  hasReachableGuidancePath({
    loaderSource: questionBanks,
    pageSource: reviewPage,
  }),
  "The reachable Teacher Review summary/card path must consume stored boundary findings.",
);
assert(
  !hasReachableGuidancePath({
    loaderSource: questionBanks,
    pageSource: reviewPage.replace(
      "question.reviewGuidance",
      "[] /* boundary guidance dropped */",
    ),
  }),
  "Dropping guidance at the Review card must fail the source contract.",
);

assert(
  questionBanks.includes('.from("import_batches")') &&
    questionBanks.includes('.select("id, summary")') &&
    questionBanks.includes("aiPdfImport.questionBoundaryGuardPlan") &&
    questionBanks.includes("question.question_code"),
  "Review summaries must reuse the stored import boundary plan and question identity.",
);

for (const safeCategoryCopy of [
  "Source boundary needs review",
  "Answer and solution need review",
  "Evidence is incomplete",
  "Visual evidence needs review",
  "Taxonomy needs review",
  "Possible duplicate draft",
]) {
  assert(
    guidance.includes(safeCategoryCopy),
    `Missing safe Teacher Review category: ${safeCategoryCopy}`,
  );
}

assert(
  guidance.includes('reviewStatus === "needs_more_evidence"') &&
    guidance.includes("if (!findings.length) return null") === false &&
    component.includes("if (!findings.length) return null") &&
    component.includes('aria-label="Review guidance"') &&
    component.includes("finding.sourcePages.join") &&
    !guidance.includes("finding.explanation") &&
    !guidance.includes("finding.reasonCodes") &&
    !guidance.includes("finding.suggestedReviewAction") &&
    !reviewPage.includes("softWarnings.join"),
  "Teacher guidance must be fail-closed, concise, and free of raw Provider-adjacent diagnostics.",
);

for (const source of [component, guidance, reviewPage]) {
  assert(
    !/api[_-]?key|service[_-]?role|provider raw response|chain of thought/i.test(source),
    "Teacher Review guidance must not expose secret or raw reasoning fields.",
  );
}

assert(
  reviewPage.includes("approveBankReviewQuestion") &&
    reviewPage.includes("markBankReviewDraftNeedsFix") &&
    reviewPage.includes("rejectBankReviewDraftQuestion") &&
    !reviewPage.includes("autoApprove") &&
    !reviewPage.includes("createAssignment"),
  "Boundary guidance must preserve manual approval, needs-fix, rejection, and no auto-assignment.",
);

assert(
  smokeAll.includes("teacher-review-boundary-guidance-smoke.mjs"),
  "Aggregate smoke must include Teacher Review boundary guidance coverage.",
);

console.log("PASS Teacher Review boundary guidance source smoke");
