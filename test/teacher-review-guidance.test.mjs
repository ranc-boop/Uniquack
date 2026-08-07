import assert from "node:assert/strict";
import test from "node:test";

import { buildTeacherReviewGuidance } from "../src/lib/questions/teacher-review-guidance.ts";

function boundaryFinding(issueKind, pageRefs = []) {
  return {
    chunkIndexes: [],
    explanation: "provider-adjacent detail must never be rendered",
    findingId: `finding-${issueKind}`,
    issueKind,
    packetIds: [],
    pageRefs,
    questionCodes: [],
    questionIds: [],
    reasonCodes: ["internal_reason_code"],
    recoveryProvenance: ["original"],
    severity: "high",
    suggestedReviewAction: "review_manually",
    visibleQuestionNumbers: [],
  };
}

test("maps stored Review signals into concise safe guidance", () => {
  const guidance = buildTeacherReviewGuidance({
    boundaryFindings: [
      boundaryFinding("cross_page_fragment", [3, 2, 3]),
      boundaryFinding("visual_association", [4]),
      boundaryFinding("answer_alignment", [2]),
      boundaryFinding("likely_duplicate", [1]),
    ],
    hardErrors: ["A referenced question image is unavailable."],
    reviewStatus: "needs_more_evidence",
    softWarnings: ["Taxonomy is not set."],
  });

  assert.deepEqual(
    guidance.map((item) => `${item.level}:${item.category}`),
    [
      "review:source_boundary",
      "review:visual",
      "review:answer_solution",
      "review:duplicate",
      "blocking:visual",
      "review:taxonomy",
      "blocking:evidence",
    ],
  );
  assert.deepEqual(guidance[0].sourcePages, [2, 3]);
});

test("does not pass raw findings or unknown diagnostics through to the UI", () => {
  const rawDiagnostic =
    "gemini provider response contained a private prompt and credential-like material";
  const guidance = buildTeacherReviewGuidance({
    boundaryFindings: [boundaryFinding("question_number_conflict", [8])],
    hardErrors: [rawDiagnostic],
  });
  const rendered = JSON.stringify(guidance);

  assert.equal(rendered.includes(rawDiagnostic), false);
  assert.equal(rendered.includes("provider-adjacent detail"), false);
  assert.equal(rendered.includes("internal_reason_code"), false);
  assert.equal(rendered.includes("Source boundary needs review"), true);
  assert.equal(rendered.includes("Stored Review check needs attention"), true);
});

test("fails closed for an older or malformed stored finding", () => {
  const malformed = boundaryFinding("future_unrecognized_issue");
  malformed.pageRefs = "private source coordinates";

  const guidance = buildTeacherReviewGuidance({
    boundaryFindings: [malformed],
  });

  assert.deepEqual(guidance, [
    {
      category: "other",
      level: "review",
      sourcePages: [],
      summary: "Resolve the stored Review check before approving this draft.",
      title: "Stored Review check needs attention",
    },
  ]);
});

test("returns no invented guidance when the stored contracts report no finding", () => {
  assert.deepEqual(buildTeacherReviewGuidance({}), []);
});
