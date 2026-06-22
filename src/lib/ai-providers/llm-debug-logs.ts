import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const REDACTED = "[redacted]";
const LOG_ROOT = path.join(process.cwd(), "log", "llm", "ai_import");

type DebugLogInput = {
  context?: Record<string, unknown>;
  event: string;
  payload: unknown;
};

function enabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function isAIImportLLMDebugLogEnabled() {
  return enabled(process.env.AI_IMPORT_LLM_DEBUG_LOGS);
}

function safeFilePart(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function shouldRedactKey(key: string) {
  return /^(authorization|x-goog-api-key|api[_-]?key|access[_-]?token|secret|password)$/i.test(
    key,
  );
}

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Buffer.isBuffer(value)) {
    return {
      byteLength: value.byteLength,
      type: "Buffer",
    };
  }

  if (value instanceof Uint8Array) {
    return {
      byteLength: value.byteLength,
      type: "Uint8Array",
    };
  }

  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      shouldRedactKey(key) ? REDACTED : sanitize(item, seen),
    ]),
  );
}

export async function writeAIImportLLMDebugLog({
  context = {},
  event,
  payload,
}: DebugLogInput) {
  if (!isAIImportLLMDebugLogEnabled()) {
    return;
  }

  const now = new Date();
  const dateDir = now.toISOString().slice(0, 10);
  const batch = safeFilePart(context.batchId) || "batch";
  const chunk =
    context.chunkIndex === undefined
      ? "full"
      : `chunk-${safeFilePart(Number(context.chunkIndex) + 1)}`;
  const suffix = crypto.randomUUID().slice(0, 8);
  const fileName = `${now
    .toISOString()
    .replace(/[:.]/g, "-")}_${batch}_${chunk}_${safeFilePart(event)}_${suffix}.json`;
  const fullPath = path.join(LOG_ROOT, dateDir, fileName);

  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(
      fullPath,
      `${JSON.stringify(
        {
          context: sanitize(context),
          event,
          payload: sanitize(payload),
          writtenAt: now.toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } catch (error) {
    console.warn(
      "AI import LLM debug log write failed:",
      error instanceof Error ? error.message : error,
    );
  }
}
