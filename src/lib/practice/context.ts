import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { PracticeTraceEvent } from "@/lib/practice/types";

const LOG_ROOT = path.join(process.cwd(), "log", "llm", "practice_agent");
const MAX_MEMORY_CHARS = 1600;
const MAX_DIGEST_CHARS = 4500;

function enabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function isPracticeFullCallLogEnabled() {
  return enabled(process.env.PRACTICE_AGENT_FULL_CALL_LOGS);
}

export function compactText(value: string | null | undefined, maxLength = 800) {
  const text = (value ?? "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}...`;
}

export function compactSessionMemory(value: string | undefined, fallbackGoal: string) {
  const normalized = (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MEMORY_CHARS);

  if (normalized) {
    return normalized;
  }

  return `Goal: ${fallbackGoal.slice(0, 240)}. No completed rounds yet.`;
}

export function buildToolDigest(items: unknown[]) {
  return JSON.stringify(items).replace(/\s+/g, " ").slice(0, MAX_DIGEST_CHARS);
}

export async function writePracticeFullCallLog({
  context,
  event,
  payload,
}: {
  context?: Record<string, unknown>;
  event: string;
  payload: unknown;
}) {
  if (!isPracticeFullCallLogEnabled()) {
    return false;
  }

  const now = new Date();
  const suffix = crypto.randomUUID().slice(0, 8);
  const fileName = `${now.toISOString().replace(/[:.]/g, "-")}_${event}_${suffix}.json`;
  const fullPath = path.join(LOG_ROOT, now.toISOString().slice(0, 10), fileName);

  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(
      fullPath,
      `${JSON.stringify({ context, event, payload, writtenAt: now.toISOString() }, null, 2)}\n`,
      "utf8",
    );
    return true;
  } catch (error) {
    console.warn(
      "Practice agent full call log write failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

export async function traced<T>({
  inputSummary,
  outputSummary,
  phase,
  trace,
  toolName,
  run,
}: {
  inputSummary?: string;
  outputSummary?: (value: T) => string;
  phase: PracticeTraceEvent["phase"];
  trace: PracticeTraceEvent[];
  toolName: string;
  run: () => Promise<T>;
}) {
  const started = Date.now();

  try {
    const value = await run();
    const resultCount = Array.isArray(value) ? value.length : undefined;
    trace.push({
      elapsedMs: Date.now() - started,
      inputSummary,
      outputSummary: outputSummary ? outputSummary(value) : undefined,
      phase,
      resultCount,
      savedFullPayload: false,
      toolName,
    });
    return value;
  } catch (error) {
    trace.push({
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      inputSummary,
      phase,
      toolName,
    });
    throw error;
  }
}
