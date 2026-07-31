import assert from "node:assert/strict";
import fs from "node:fs";

const agent = fs.readFileSync("src/lib/practice/agent-loop.ts", "utf8");
const client = fs.readFileSync(
  "src/components/practice/practice-agent-client.tsx",
  "utf8",
);
const errors = fs.readFileSync(
  "src/lib/practice/recommendation-errors.ts",
  "utf8",
);
const route = fs.readFileSync(
  "src/app/api/practice/recommend/route.ts",
  "utf8",
);

const allowedTools = agent.slice(
  agent.indexOf("function allowedToolNamesForState"),
  agent.indexOf("function makeToolResultMessage"),
);
assert(
  allowedTools.includes(
    "state.searchCallsSucceeded > 0 && state.candidatePool.size > 0",
  ),
  "finalize must remain unavailable until a successful search produced candidates",
);
assert(
  !allowedTools.includes("new Set<string>([finalizeTool.function.name])"),
  "finalize must not be available in the initial tool state",
);

const searchExecution = agent.slice(
  agent.indexOf('} else if (toolName === "practice_search_batch")'),
  agent.indexOf('} else if (toolName === "finish_practice")'),
);
assert(
  searchExecution.indexOf("await practiceSearchBatch") <
    searchExecution.indexOf("state.searchCallsSucceeded += 1"),
  "a search counts as successful only after the backend search resolves",
);
assert(
  agent.includes(
    'if (toolName === "practice_search_batch" && !searchCompleted)',
  ) && agent.includes("state.searchCallsFailed += 1"),
  "failed backend searches must be tracked separately from successful searches",
);
assert(
  agent.includes("state.searchCallsSucceeded >= SEARCH_CALL_LIMIT") &&
    agent.includes('? "scope_exhausted"') &&
    agent.includes('? "search_failed"') &&
    agent.includes(': "protocol_failed"'),
  "agent result must distinguish verified exhaustion, search failure, and protocol failure",
);

for (const code of [
  "PRACTICE_RECOMMENDATION_NO_CONTENT",
  "PRACTICE_RECOMMENDATION_PROTOCOL_FAILED",
  "PRACTICE_RECOMMENDATION_SEARCH_FAILED",
]) {
  assert(errors.includes(code), `missing stable recommendation error code ${code}`);
}
assert(
  route.includes('agentResult.recommendationOutcome === "scope_exhausted"') &&
    route.includes("acceptedFinishRequest"),
  "scope-exhausted completion must require the verified agent outcome",
);
assert(
  !route.includes("No published questions are available for this practice request."),
  "recommend failures must not claim all valid Library questions are published",
);
assert(
  client.includes("errorPayload.code") &&
    client.includes("PRACTICE_RECOMMENDATION_ERROR_CODES.NO_CONTENT") &&
    client.includes("PRACTICE_RECOMMENDATION_ERROR_CODES.SEARCH_FAILED") &&
    client.includes("PRACTICE_RECOMMENDATION_ERROR_CODES.PROTOCOL_FAILED"),
  "client must map recommendation failures by stable code",
);

console.log("PASS practice recommendation search/finalize gate and failure taxonomy");
