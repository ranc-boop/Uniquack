import "server-only";

import fs from "node:fs/promises";
import path from "node:path";

const PROMPT_ROOT = path.join(process.cwd(), "src", "lib", "practice", "prompts");
const cache = new Map<string, string>();

export async function loadPracticePrompt(name: string) {
  const safeName = name.replace(/[^a-z0-9_.-]/gi, "");
  const cached = cache.get(safeName);

  if (cached) {
    return cached;
  }

  const prompt = (await fs.readFile(path.join(PROMPT_ROOT, `${safeName}.md`), "utf8")).trim();
  cache.set(safeName, prompt);
  return prompt;
}
