import "server-only";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { CURRENT_PRACTICE_SESSION_SCHEMA_VERSION } from "@/lib/practice/schema";
import type { PracticeTraceEvent } from "@/lib/practice/types";

const LOG_ROOT = path.join(process.cwd(), "log", "llm", "practice_agent");
const MAX_DIGEST_CHARS = 4500;
const PRACTICE_FULL_CALL_LOG_RETENTION_DAYS = 2;
const PRACTICE_FULL_CALL_LOG_RETENTION_MS =
  PRACTICE_FULL_CALL_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const SENSITIVE_LOG_KEY = /(?:answer|args|authorization|body|content|cookie|credential|error_message|input|jwt|message|observation|output|password|payload|prompt|question|raw|reasoning|request|response|secret|session|token|trace|url|user)/i;
const SAFE_LOG_STRING_KEYS = new Set([
  "errorCode",
  "event",
  "method",
  "model",
  "name",
  "operation",
  "phase",
  "provider",
  "providerName",
  "toolName",
]);

function enabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function isSharedPracticeRuntime() {
  const vercelEnvironment = process.env.VERCEL_ENV?.trim().toLowerCase();

  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.CI === "true" ||
    ["preview", "production"].includes(vercelEnvironment ?? "")
  );
}

export function isPracticeFullCallLogEnabled() {
  // This non-public process variable is intentionally insufficient in shared
  // environments. Full request/response logging is local-development only.
  return !isSharedPracticeRuntime() && enabled(process.env.PRACTICE_AGENT_FULL_CALL_LOGS);
}

export function isPracticeStatsLogEnabled() {
  return enabled(process.env.PRACTICE_AGENT_TOKEN_STATS_LOGS ?? "1");
}

export function stableHash(value: unknown) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex").slice(0, 16);
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortKeysDeep(item)]),
  );
}

export function stableStringify(value: unknown, space?: number) {
  return JSON.stringify(sortKeysDeep(value), null, space);
}

export function sanitizePracticeLogValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_LOG_KEY.test(key)) {
    return "[omitted]";
  }

  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (!SAFE_LOG_STRING_KEYS.has(key) || /https?:\/\//i.test(value)) {
      return "[omitted]";
    }

    return value.slice(0, 160);
  }

  if (Array.isArray(value)) {
    return { itemCount: value.length, value: "[omitted array]" };
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 24)
        .map(([entryKey, entryValue]) => [
          entryKey,
          sanitizePracticeLogValue(entryValue, entryKey),
        ]),
    );
  }

  return "[omitted]";
}

async function prunePracticeFullCallLogs(now: Date) {
  const cutoff = now.getTime() - PRACTICE_FULL_CALL_LOG_RETENTION_MS;

  try {
    const entries = await fs.readdir(LOG_ROOT, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .filter((entry) => {
          const createdAt = Date.parse(`${entry.name}T00:00:00.000Z`);
          return Number.isFinite(createdAt) && createdAt < cutoff;
        })
        .map((entry) => fs.rm(path.join(LOG_ROOT, entry.name), { force: true, recursive: true })),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== "ENOENT") {
      console.warn("Practice full-call log retention cleanup failed.");
    }
  }
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

export function buildToolDigest(items: unknown[]) {
  return stableStringify(items).replace(/\s+/g, " ").slice(0, MAX_DIGEST_CHARS);
}

function numberish(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeLLMUsage(usage: Record<string, unknown> | null | undefined) {
  const record = (usage ?? {}) as Record<string, any>;
  const cacheHitTokens = numberish(
    record.prompt_cache_hit_tokens ??
      record.prompt_tokens_details?.cached_tokens ??
      record.input_token_details?.cache_read ??
      record.cache_read_input_tokens ??
      record.cached_tokens,
  );
  const cacheMissTokens = numberish(
    record.prompt_cache_miss_tokens ??
      record.input_token_details?.cache_creation ??
      record.cache_creation_input_tokens,
  );
  const promptTokens = numberish(
    record.prompt_tokens ??
      record.input_tokens ??
      (cacheHitTokens !== undefined && cacheMissTokens !== undefined
        ? cacheHitTokens + cacheMissTokens
        : undefined),
  );
  const completionTokens = numberish(record.completion_tokens ?? record.output_tokens);
  const totalTokens = numberish(
    record.total_tokens ??
      (promptTokens !== undefined && completionTokens !== undefined
        ? promptTokens + completionTokens
        : undefined),
  );
  const cacheHitRate = promptTokens && cacheHitTokens !== undefined
    ? cacheHitTokens / Math.max(1, promptTokens)
    : cacheHitTokens !== undefined && cacheMissTokens !== undefined
      ? cacheHitTokens / Math.max(1, cacheHitTokens + cacheMissTokens)
      : undefined;

  return {
    cacheHitRate,
    cacheHitTokens,
    cacheMissTokens,
    completionTokens,
    promptTokens,
    totalTokens,
  };
}

export function summarizeLLMUsage(usage: Record<string, unknown> | null | undefined) {
  if (!usage) {
    return "";
  }

  const normalized = normalizeLLMUsage(usage);

  return [
    normalized.promptTokens !== undefined ? `prompt=${normalized.promptTokens}` : "",
    normalized.completionTokens !== undefined ? `completion=${normalized.completionTokens}` : "",
    normalized.totalTokens !== undefined ? `total=${normalized.totalTokens}` : "",
    normalized.cacheHitTokens !== undefined ? `cache_hit=${normalized.cacheHitTokens}` : "",
    normalized.cacheMissTokens !== undefined ? `cache_miss=${normalized.cacheMissTokens}` : "",
    normalized.cacheHitRate !== undefined ? `hit_rate=${Math.round(normalized.cacheHitRate * 100)}%` : "",
  ].filter(Boolean).join("; ");
}

export function buildUsageEnvelope({
  cachePrefixVersion,
  phase,
  prefixPayload,
  providerLabel,
  suffixPayload,
  usage,
}: {
  cachePrefixVersion?: string;
  phase: string;
  prefixPayload?: unknown;
  providerLabel?: string;
  suffixPayload?: unknown;
  usage: Record<string, unknown> | null | undefined;
}) {
  const normalized = normalizeLLMUsage(usage);
  return {
    cache_hit_rate: normalized.cacheHitRate ?? null,
    cache_hit_tokens: normalized.cacheHitTokens ?? null,
    cache_miss_tokens: normalized.cacheMissTokens ?? null,
    cache_prefix_version: cachePrefixVersion ?? CURRENT_PRACTICE_SESSION_SCHEMA_VERSION,
    completion_tokens: normalized.completionTokens ?? null,
    phase,
    prefix_hash: prefixPayload === undefined ? null : stableHash(prefixPayload),
    prompt_tokens: normalized.promptTokens ?? null,
    provider_label: providerLabel ?? null,
    suffix_hash: suffixPayload === undefined ? null : stableHash(suffixPayload),
    total_tokens: normalized.totalTokens ?? null,
    usage: usage ?? null,
  };
}

export async function writePracticeStatsLog({
  context,
  payload,
}: {
  context?: Record<string, unknown>;
  payload: unknown;
}) {
  if (!isPracticeStatsLogEnabled()) {
    return false;
  }

  const now = new Date();
  const fileName = `${now.toISOString().replace(/[:.]/g, "-")}_usage_${crypto.randomUUID().slice(0, 8)}.json`;
  const fullPath = path.join(LOG_ROOT, now.toISOString().slice(0, 10), fileName);

  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(
      fullPath,
      `${stableStringify({ context, event: "usage", payload, writtenAt: now.toISOString() }, 2)}\n`,
      "utf8",
    );
    return true;
  } catch (error) {
    console.warn(
      "Practice agent token stats log write failed:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
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
    await prunePracticeFullCallLogs(now);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(
      fullPath,
      `${stableStringify({
        context: sanitizePracticeLogValue(context ?? {}, "context"),
        event: sanitizePracticeLogValue(event, "event"),
        payload: sanitizePracticeLogValue(payload),
        retentionDays: PRACTICE_FULL_CALL_LOG_RETENTION_DAYS,
        writtenAt: now.toISOString(),
      }, 2)}\n`,
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
