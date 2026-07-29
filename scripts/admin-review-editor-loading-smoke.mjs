import { readFile } from "node:fs/promises";

const card = await readFile(
  new URL("../src/components/draft-review-card.tsx", import.meta.url),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL ${message}`);
  console.log(`PASS ${message}`);
}

assert(
  card.includes('import dynamic from "next/dynamic"') &&
    card.includes('import("@/components/question-editor")') &&
    card.includes("(module) => module.QuestionEditor") &&
    card.includes("isEditorOpen ? ("),
  "review cards only download and mount the heavy question editor after explicit interaction",
);

assert(
  !card.includes('import { QuestionEditor') &&
    card.includes('import type { EditableQuestion }'),
  "the review-list entry chunk has no eager runtime dependency on the editor",
);
