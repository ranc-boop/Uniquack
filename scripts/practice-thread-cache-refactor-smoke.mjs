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

const migration = read("supabase/migrations/0017_practice_thread_cache_snapshot.sql");
const agentLoop = read("src/lib/practice/agent-loop.ts");
const persistence = read("src/lib/practice/persistence.ts");
const recommendRoute = read("src/app/api/practice/recommend/route.ts");
const reviewRoute = read("src/app/api/practice/review/route.ts");

assertIncludes(migration, "long_term_memory_snapshot", "session long-term snapshot migration");
assertIncludes(recommendRoute, "lockedLongTermMemory", "recommend locked memory snapshot");
assertIncludes(reviewRoute, "lockedLongTermMemory", "review locked memory snapshot");
assertIncludes(agentLoop, "currentTaskSuffix: dynamicSuffix", "recommend current task suffix return");
assertIncludes(persistence, "current_task_suffix: currentTaskSuffix", "current task suffix persistence");
assertIncludes(persistence, "kind: \"thread_checkpoint\"", "round checkpoint entry");
assertIncludes(persistence, "roundIndex % 10 === 0", "round-10 checkpoint trigger");

const stablePrefixStart = reviewRoute.indexOf("const stableReviewPrefix = {");
const stablePrefixEnd = reviewRoute.indexOf("const stableThreadMessages", stablePrefixStart);
const stablePrefixBlock = reviewRoute.slice(stablePrefixStart, stablePrefixEnd);
assertNotIncludes(stablePrefixBlock, "round_contract", "round_contract in stable review prefix");

const suffixStart = reviewRoute.indexOf("const reviewSuffix = {");
const suffixEnd = reviewRoute.indexOf("const aiResult", suffixStart);
const suffixBlock = reviewRoute.slice(suffixStart, suffixEnd);
assertIncludes(suffixBlock, "round_contract: roundContract", "round_contract in review suffix");
assertIncludes(suffixBlock, "current_round_thread_entry", "current round thread entry in review suffix");

console.log("practice thread cache refactor smoke passed");
