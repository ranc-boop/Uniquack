import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");

const [traceSafety, tracePanel] = await Promise.all([
  read("src/lib/practice/trace-safety.ts"),
  read("src/components/practice/practice-trace-panel.tsx"),
]);

for (const toolName of [
  "practice_browse_step",
  "practice_finalize_step",
  "practice_model_step",
  "practice_progress_step",
  "practice_search_step",
]) {
  assert(traceSafety.includes(toolName), `Trace sanitizer must expose safe ${toolName} category.`);
}

assert(
  traceSafety.includes("PUBLIC_TRACE_TOOL_NAMES") &&
    traceSafety.includes("sourceToolName === \"model_tool_choice\"") &&
    traceSafety.includes("sourceToolName === \"practice_search_batch\""),
  "Trace sanitizer must classify internal events into safe public categories.",
);
assert(
  tracePanel.includes("MAX_DISPLAY_TRACE_EVENTS = 8") &&
    tracePanel.includes("practice_progress_step") &&
    tracePanel.includes("const indexesByKey = new Map") &&
    tracePanel.includes("compacted.slice(-MAX_DISPLAY_TRACE_EVENTS)"),
  "Thinking trace must filter noise, deduplicate repeated events, and cap rendered cards.",
);

console.log("PASS Practice thinking trace uses safe categories and bounded rendering");
