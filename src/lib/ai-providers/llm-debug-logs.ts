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

function stringFingerprint(value: string) {
  return {
    byteLength: Buffer.byteLength(value, "utf8"),
    sha256: crypto.createHash("sha256").update(value).digest("hex"),
    type: "string",
  };
}

function shouldRedactKey(key: string) {
  return /^(authorization|x-goog-api-key|api[_-]?key|access[_-]?token|secret|password)$/i.test(
    key,
  );
}

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return stringFingerprint(value);
  }

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
    return {
      itemCount: value.length,
      items: value.slice(0, 20).map((item) => sanitize(item, seen)),
      truncated: value.length > 20,
      type: "array",
    };
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 50)
      .map(([key, item]) => [
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
  const suffix = crypto.randomUUID().slice(0, 8);
  const fileName = `${now
    .toISOString()
    .replace(/[:.]/g, "-")}_${safeFilePart(event)}_${suffix}.json`;
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
  } catch {
    console.warn("AI import LLM debug log write failed.");
  }
}
