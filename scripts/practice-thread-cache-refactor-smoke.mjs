import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`Missing ${label}: ${needle}`);
  }
}

function assertNotIncludes(text, needle, label) {
  if (text.includes(needle)) {
    throw new Error(`Unexpected ${label}: ${needle}`);
  }
}

const migration = read("supabase/clean-migrations/0008_practice_agent_evidence.sql");
const agentLoop = read("src/lib/practice/agent-loop.ts");
const persistence = read("src/lib/practice/persistence.ts");
const recommendRoute = read("src/app/api/practice/recommend/route.ts");
const reviewRoute = read("src/app/api/practice/review/route.ts");

assertIncludes(migration, "long_term_memory_snapshot", "session long-term snapshot migration");
assertIncludes(recommendRoute, "lockedLongTermMemory", "recommend locked memory snapshot");
assertIncludes(reviewRoute, "lockedLongTermMemory", "review locked memory snapshot");
assertIncludes(agentLoop, "currentTaskSuffix: dynamicSuffix", "recommend current task suffix return");
assertIncludes(persistence, "current_task_suffix: currentTaskSuffix", "current task suffix persistence");
assertIncludes(persistence, "kind: \"question_review\"", "question review thread entry");
assertIncludes(persistence, "kind: \"round_review\"", "round review thread entry");
assertIncludes(persistence, "kind: \"thread_checkpoint\"", "round checkpoint entry");
assertIncludes(persistence, "roundIndex % 10 === 0", "round-10 checkpoint trigger");
assertIncludes(reviewRoute, "question_review", "streamed per-question review event");
assertIncludes(reviewRoute, "round_review_delta", "streamed round review delta event");
assertIncludes(reviewRoute, "toolChoice: \"none\"", "main-thread round review disables tools");
assertIncludes(reviewRoute, "persistQuestionReviewResults", "question review persistence");
assertIncludes(reviewRoute, "persistRoundReviewSummary", "round review persistence");

const reviewerPrompt = read("src/lib/practice/prompts/review-system.md");
assertIncludes(reviewerPrompt, "review exactly one submitted question", "single-question reviewer scope");
assertNotIncludes(reviewerPrompt, "next_round_goal", "reviewer next-round goal generation");
assertNotIncludes(reviewerPrompt, "episode_card", "reviewer episode card generation");

console.log("practice thread cache refactor smoke passed");
