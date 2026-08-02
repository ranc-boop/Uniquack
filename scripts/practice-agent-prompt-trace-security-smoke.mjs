import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

const [
  agentLoop,
  traceTypes,
  traceSafety,
  tracePanel,
  persistence,
  recommendRoute,
  recommendationPrompt,
  reviewPrompt,
  hintPrompt,
  preferenceMergePrompt,
] = await Promise.all([
  read("src/lib/practice/agent-loop.ts"),
  read("src/lib/practice/types.ts"),
  read("src/lib/practice/trace-safety.ts"),
  read("src/components/practice/practice-trace-panel.tsx"),
  read("src/lib/practice/persistence.ts"),
  read("src/app/api/practice/recommend/route.ts"),
  read("src/lib/practice/prompts/recommendation-system.md"),
  read("src/lib/practice/prompts/review-system.md"),
  read("src/lib/practice/prompts/hint-system.md"),
  read("src/lib/practice/prompts/preference-merge-system.md"),
]);

function includesAll(source, values, label) {
  for (const value of values) {
    assert(source.includes(value), `${label}: missing ${value}`);
  }
}

includesAll(
  agentLoop,
  [
    "tailPolicyNotices",
    'role: "user" as const',
    "...tailPolicyNotices",
    "sanitizePublicPracticeTraceEvent",
  ],
  "Recommendation thread notices must stay untrusted and public trace must be sanitized",
);
assert(
  !/tool_policy_notice_[\s\S]{0,200}role:\s*"system"/.test(agentLoop),
  "Database-backed tool_policy_notice entries must never become system messages.",
);
assert(
  !agentLoop.includes("modelThought:") &&
    !agentLoop.includes("reasoningContent:") &&
    !agentLoop.includes("modelResult.contentText.slice"),
  "Recommendation trace must not copy raw model text or provider reasoning.",
);

assert(
  !traceTypes.includes("modelThought?:") && !traceTypes.includes("reasoningContent?:"),
  "The public trace contract must not expose raw model or reasoning fields.",
);
includesAll(
  traceSafety,
  [
    "sanitizePublicPracticeTraceEvent",
    "sanitizePublicPracticeTrace",
    "publicPracticeTraceToolName",
    'thoughtSummary: undefined',
    'inputPayload: undefined',
    'outputPayload: undefined',
    'savedFullPayload: undefined',
  ],
  "Trace sanitizer must replace internal tool names and remove all model-controlled payload channels",
);
assert(
  !recommendRoute.includes("roundContract: agentResult.roundContract"),
  "Recommendation responses must not expose the model-authored round contract.",
);
includesAll(
  persistence,
  [
    "sanitizePublicPracticeTrace(value)",
    "sanitizePublicPracticeTrace(trace)",
  ],
  "Every persisted or restored trace must cross the public sanitizer",
);
assert.equal(
  persistence.match(/sanitizePublicPracticeTrace\(trace\)/g)?.length,
  3,
  "Recommendation, question review, and round review persistence must all sanitize trace writes.",
);
assert(
  !tracePanel.includes("event.modelThought") &&
    !tracePanel.includes("event.reasoningContent") &&
    !tracePanel.includes("Raw reasoning content") &&
    !tracePanel.includes("Full original model text"),
  "Learner trace UI must not render raw model text or reasoning.",
);

for (const [name, prompt] of [
  ["recommendation", recommendationPrompt],
  ["review", reviewPrompt],
  ["hint", hintPrompt],
  ["preference merge", preferenceMergePrompt],
]) {
  includesAll(
    prompt,
    [
      "Untrusted-content boundary:",
      "direct or indirect prompt injection",
      "Prompt confidentiality:",
      "system prompt",
      "tool schema",
      "internal reasoning",
    ],
    `${name} prompt injection and confidentiality policy`,
  );
}

console.log("PASS database thread notices remain untrusted user context");
console.log("PASS public Practice trace excludes raw model text and reasoning");
console.log("PASS all Practice system prompts define injection and confidentiality boundaries");
