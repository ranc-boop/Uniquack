import { readFile } from "node:fs/promises";

const route = await readFile(
  new URL("../src/app/api/practice/review/route.ts", import.meta.url),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  console.log(`PASS ${message}`);
}

assert(
  route.includes("const REVIEW_CONCURRENCY = 3") &&
    route.includes("async function reviewNextAttempt()") &&
    route.includes("Promise.all(") &&
    route.includes("Array.from({ length: workerCount }") &&
    !route.includes("for (const attempt of attempts)"),
  "per-question model reviews use a bounded worker pool instead of serial provider waits",
);

assert(
  route.includes("resultsByIndex[index] = normalized.result") &&
    route.includes("questionReviewsByIndex[index] = normalized.review") &&
    route.includes("const results = resultsByIndex.filter") &&
    route.includes("const questionReviews = questionReviewsByIndex.filter"),
  "parallel review completion preserves original question order for persistence and summaries",
);
