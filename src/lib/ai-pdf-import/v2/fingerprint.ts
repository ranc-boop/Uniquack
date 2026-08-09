import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }

  return value;
}

export function canonicalJsonV2(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function sha256CanonicalJsonV2(value: unknown) {
  return createHash("sha256").update(canonicalJsonV2(value)).digest("hex");
}

export function sha256TextV2(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeTextLineEndingsV2(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

export function sha256NormalizedTextV2(value: string) {
  return sha256TextV2(normalizeTextLineEndingsV2(value));
}

export function utf8BytesV2(value: string) {
  return Buffer.byteLength(value, "utf8");
}
