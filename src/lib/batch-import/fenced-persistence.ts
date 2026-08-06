import { createHash } from "node:crypto";

export const FENCED_IMPORT_ITEM_RPC_MAX_ATTEMPTS = 2;

export const FENCED_IMPORT_FAILURE_REASONS = [
  "rpc_authorization",
  "rpc_constraint",
  "rpc_request",
  "rpc_transient",
  "rpc_unknown",
] as const;

export type FencedImportFailureReason =
  (typeof FENCED_IMPORT_FAILURE_REASONS)[number];

export type FencedImportFailureDiagnostic = {
  fingerprint: string;
  httpClassification: "4xx" | "5xx" | "network" | "none" | "timeout";
  reason: FencedImportFailureReason;
  retryable: boolean;
  sqlStateClass: string;
  validationCategory:
    | "authorization"
    | "constraint"
    | "none"
    | "request"
    | "unknown";
};

function record(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function boundedStatus(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 599
    ? parsed
    : null;
}

function safeCode(error: unknown) {
  const top = record(error);
  const cause = record(top.cause);
  const value = top.code ?? cause.code;
  return typeof value === "string" && /^[A-Z0-9]{2,12}$/i.test(value)
    ? value.toUpperCase()
    : "";
}

export function classifyFencedImportFailure(
  error: unknown,
): FencedImportFailureDiagnostic {
  const top = record(error);
  const response = record(top.response);
  const status = boundedStatus(
    top.status ?? top.statusCode ?? response.status ?? response.statusCode,
  );
  const code = safeCode(error);
  const sqlStateClass = /^[0-9A-Z]{5}$/.test(code) ? code.slice(0, 2) : "none";
  const networkCodes = new Set([
    "ECONNABORTED",
    "ECONNREFUSED",
    "ECONNRESET",
    "ENETUNREACH",
    "ENOTFOUND",
    "ETIMEDOUT",
  ]);
  const transientSqlState =
    sqlStateClass === "08" ||
    ["40001", "40P01", "53300", "53400", "55P03", "57014", "57P01", "57P02", "57P03"].includes(
      code,
    );
  const transientPostgrest = ["PGRST000", "PGRST001", "PGRST002", "PGRST003"].includes(
    code,
  );
  const timedOut =
    code === "ETIMEDOUT" || top.name === "AbortError" || status === 408 || status === 504;
  const network = networkCodes.has(code);
  const transientHttp = status === 429 || (status !== null && status >= 500);
  const authorization =
    [401, 403].includes(status ?? 0) ||
    sqlStateClass === "28" ||
    code === "42501";
  const constraint = sqlStateClass === "23";
  const request =
    (status !== null && status >= 400 && status < 500 && !authorization) ||
    ["22", "42"].includes(sqlStateClass);
  const retryable =
    timedOut || network || transientHttp || transientSqlState || transientPostgrest;
  const reason: FencedImportFailureReason = retryable
    ? "rpc_transient"
    : authorization
      ? "rpc_authorization"
      : constraint
        ? "rpc_constraint"
        : request
          ? "rpc_request"
          : "rpc_unknown";
  const httpClassification = timedOut
    ? "timeout"
    : network
      ? "network"
      : status !== null && status >= 500
        ? "5xx"
        : status !== null && status >= 400
          ? "4xx"
          : "none";
  const validationCategory = authorization
    ? "authorization"
    : constraint
      ? "constraint"
      : request
        ? "request"
        : retryable
          ? "none"
          : "unknown";
  const bounded = {
    httpClassification,
    reason,
    retryable,
    sqlStateClass,
    validationCategory,
  } as const;
  return {
    ...bounded,
    fingerprint: createHash("sha256")
      .update(JSON.stringify(bounded))
      .digest("hex"),
  };
}

export class FencedImportPersistenceError extends Error {
  readonly diagnostic: FencedImportFailureDiagnostic;

  constructor(error: unknown) {
    super("Fenced import item persistence failed.");
    this.name = "FencedImportPersistenceError";
    this.diagnostic = classifyFencedImportFailure(error);
  }
}

export function fencedImportPersistenceError(error: unknown) {
  return error instanceof FencedImportPersistenceError
    ? error
    : new FencedImportPersistenceError(error);
}

type FencedImportRpcResult<TData, TError> = {
  data: TData;
  error: TError | null;
};

export async function runFencedImportItemRpcWithReplay<
  TData,
  TError extends { message?: string },
>(
  operation: () => Promise<FencedImportRpcResult<TData, TError>>,
) {
  let lastResult: FencedImportRpcResult<TData, TError> | null = null;
  let lastThrown: unknown;

  for (
    let attempt = 1;
    attempt <= FENCED_IMPORT_ITEM_RPC_MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      const result = await operation();
      if (!result.error) return result;
      lastResult = result;
      lastThrown = undefined;
    } catch (error) {
      lastResult = null;
      lastThrown = error;
    }
  }

  if (lastResult) return lastResult;
  throw fencedImportPersistenceError(lastThrown);
}
