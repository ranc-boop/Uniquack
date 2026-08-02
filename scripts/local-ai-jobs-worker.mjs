import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const LOCAL_AI_JOBS_WORKER_DEFAULTS = Object.freeze({
  activeDelayMs: 1_000,
  fatalFailureDelayMs: 5_000,
  idleDelayMs: 15_000,
  maxConsecutiveFatalFailures: 3,
  requestTimeoutMs: 245_000,
  unavailableBackoffBaseMs: 2_000,
  unavailableBackoffMaxMs: 30_000,
});

export const DEFAULT_LOCAL_AI_JOBS_ROUTE =
  "http://127.0.0.1:3000/api/internal/ai-jobs/run";

const INTERNAL_TOKEN_HEADER = "x-ai-jobs-internal-token";
const MAX_RESPONSE_BYTES = 8_192;
const WORKER_ROUTE_PATH = "/api/internal/ai-jobs/run";
const RAW_ROUTE_PATTERN =
  /^(?<protocol>[A-Za-z][A-Za-z0-9+.-]*):\/\/(?<authority>[^/?#]+)(?<pathname>\/[^?#]*)?(?<search>\?[^#]*)?(?<hash>#.*)?$/;
const RAW_VISIBLE_ASCII_PATTERN = /^[\x21-\x7e]+$/;
const SUPPORTED_LOCAL_PROTOCOLS = new Set(["http", "https"]);
const SUPPORTED_RAW_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PLACEHOLDER_TOKEN_MARKERS = [
  "changeme",
  "exampletoken",
  "notasecret",
  "placeholder",
  "replaceme",
  "replacewith",
  "sampletoken",
  "testtoken",
  "yourtoken",
];

export class LocalAIJobsWorkerConfigurationError extends Error {
  constructor(code) {
    super(code);
    this.name = "LocalAIJobsWorkerConfigurationError";
    this.code = code;
  }
}

function normalizedHostname(hostname) {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function validateRawLocalAIJobsWorkerRoute(value) {
  if (typeof value !== "string" || !RAW_VISIBLE_ASCII_PATTERN.test(value)) {
    throw new LocalAIJobsWorkerConfigurationError("local_route_raw_contract_rejected");
  }
  if (value.includes("%") || value.includes("\\")) {
    throw new LocalAIJobsWorkerConfigurationError("local_route_raw_contract_rejected");
  }

  const match = value.match(RAW_ROUTE_PATTERN);
  if (!match?.groups) {
    throw new LocalAIJobsWorkerConfigurationError("local_route_url_invalid");
  }

  const { authority, hash, pathname, protocol, search } = match.groups;
  if (!SUPPORTED_LOCAL_PROTOCOLS.has(protocol)) {
    throw new LocalAIJobsWorkerConfigurationError("local_route_protocol_rejected");
  }
  if (authority.includes("@")) {
    throw new LocalAIJobsWorkerConfigurationError("credential_bearing_url_rejected");
  }
  if (pathname !== WORKER_ROUTE_PATH || search || hash) {
    throw new LocalAIJobsWorkerConfigurationError("local_route_contract_rejected");
  }

  const authorityMatch = authority.startsWith("[")
    ? authority.match(/^(?<hostname>\[[^\]]+\])(?::(?<port>[0-9]+))?$/)
    : authority.match(/^(?<hostname>[^:]+)(?::(?<port>[0-9]+))?$/);
  if (!authorityMatch?.groups) {
    throw new LocalAIJobsWorkerConfigurationError("local_route_raw_contract_rejected");
  }

  const { hostname, port } = authorityMatch.groups;
  if (!SUPPORTED_RAW_HOSTNAMES.has(hostname)) {
    throw new LocalAIJobsWorkerConfigurationError("non_loopback_target_rejected");
  }
  if (
    port !== undefined &&
    ((port.length > 1 && port.startsWith("0")) || Number(port) > 65_535)
  ) {
    throw new LocalAIJobsWorkerConfigurationError("local_route_raw_contract_rejected");
  }

  return { hostname, port, protocol };
}

export function resolveLocalAIJobsWorkerRoute(value = DEFAULT_LOCAL_AI_JOBS_ROUTE) {
  const raw = validateRawLocalAIJobsWorkerRoute(value);
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new LocalAIJobsWorkerConfigurationError("local_route_url_invalid");
  }

  const hostname = normalizedHostname(target.hostname);
  if (target.protocol !== `${raw.protocol}:`) {
    throw new LocalAIJobsWorkerConfigurationError("local_route_protocol_rejected");
  }
  const expectedHostname = raw.hostname === "[::1]" ? "::1" : raw.hostname;
  if (hostname !== expectedHostname) {
    throw new LocalAIJobsWorkerConfigurationError("non_loopback_target_rejected");
  }
  const defaultPort = raw.protocol === "http" ? "80" : "443";
  const expectedParsedPort = raw.port === defaultPort ? "" : (raw.port ?? "");
  if (target.port !== expectedParsedPort) {
    throw new LocalAIJobsWorkerConfigurationError("local_route_raw_contract_rejected");
  }
  if (target.username || target.password) {
    throw new LocalAIJobsWorkerConfigurationError("credential_bearing_url_rejected");
  }
  if (
    target.pathname !== WORKER_ROUTE_PATH ||
    target.search ||
    target.hash
  ) {
    throw new LocalAIJobsWorkerConfigurationError("local_route_contract_rejected");
  }

  return target;
}

export function validateLocalAIJobsInternalToken(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new LocalAIJobsWorkerConfigurationError("internal_token_missing");
  }
  if (value !== value.trim()) {
    throw new LocalAIJobsWorkerConfigurationError("internal_token_malformed");
  }
  if (!/^[\x21-\x7e]{32,512}$/.test(value)) {
    throw new LocalAIJobsWorkerConfigurationError("internal_token_malformed");
  }

  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (PLACEHOLDER_TOKEN_MARKERS.some((marker) => normalized.includes(marker))) {
    throw new LocalAIJobsWorkerConfigurationError("internal_token_placeholder_rejected");
  }

  return value;
}

function safeAggregatePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const allowedKeys = new Set([
    "accepted",
    "claimed",
    "completed",
    "failed",
    "retryWaiting",
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;
  if (value.accepted !== true) return null;

  const counts = [
    value.claimed,
    value.completed,
    value.failed,
    value.retryWaiting,
  ];
  if (counts.some((count) => !Number.isInteger(count) || count < 0 || count > 2)) {
    return null;
  }
  if (value.completed + value.failed + value.retryWaiting > value.claimed) {
    return null;
  }

  return {
    claimed: value.claimed,
    completed: value.completed,
    failed: value.failed,
    retryWaiting: value.retryWaiting,
  };
}

function safeLogLine(now, fields) {
  return [now().toISOString(), ...Object.entries(fields).map(([key, value]) => `${key}=${value}`)].join(
    " ",
  );
}

function cappedExponentialDelay(attempt, baseMs, maxMs) {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}

async function discardResponse(response) {
  try {
    await response.body?.cancel();
  } catch {
    // The response is already closed. No diagnostics are emitted by design.
  }
}

export function createLocalAIJobsWorker({
  activeDelayMs = LOCAL_AI_JOBS_WORKER_DEFAULTS.activeDelayMs,
  fatalFailureDelayMs = LOCAL_AI_JOBS_WORKER_DEFAULTS.fatalFailureDelayMs,
  fetchImpl = globalThis.fetch,
  idleDelayMs = LOCAL_AI_JOBS_WORKER_DEFAULTS.idleDelayMs,
  logger = console.log,
  maxConsecutiveFatalFailures =
    LOCAL_AI_JOBS_WORKER_DEFAULTS.maxConsecutiveFatalFailures,
  now = () => new Date(),
  requestTimeoutMs = LOCAL_AI_JOBS_WORKER_DEFAULTS.requestTimeoutMs,
  targetUrl = DEFAULT_LOCAL_AI_JOBS_ROUTE,
  token,
  unavailableBackoffBaseMs =
    LOCAL_AI_JOBS_WORKER_DEFAULTS.unavailableBackoffBaseMs,
  unavailableBackoffMaxMs =
    LOCAL_AI_JOBS_WORKER_DEFAULTS.unavailableBackoffMaxMs,
} = {}) {
  const target = resolveLocalAIJobsWorkerRoute(targetUrl);
  const validatedToken = validateLocalAIJobsInternalToken(token);
  if (typeof fetchImpl !== "function") {
    throw new LocalAIJobsWorkerConfigurationError("fetch_implementation_missing");
  }

  let activeAbortController = null;
  let inFlight = 0;
  let maxObservedInFlight = 0;
  let running = false;
  let sleepResolve = null;
  let sleepTimer = null;
  let stopRequested = false;

  function emit(fields) {
    logger(safeLogLine(now, fields));
  }

  function stop() {
    if (stopRequested) return;
    stopRequested = true;
    activeAbortController?.abort();
    if (sleepTimer) clearTimeout(sleepTimer);
    sleepTimer = null;
    sleepResolve?.();
    sleepResolve = null;
  }

  async function waitForNextInvocation(delayMs) {
    if (stopRequested || delayMs <= 0) return;
    await new Promise((resolveWait) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        sleepTimer = null;
        sleepResolve = null;
        resolveWait();
      };
      sleepResolve = finish;
      sleepTimer = setTimeout(finish, delayMs);
    });
  }

  async function invoke() {
    const controller = new AbortController();
    activeAbortController = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, requestTimeoutMs);

    inFlight += 1;
    maxObservedInFlight = Math.max(maxObservedInFlight, inFlight);

    try {
      const response = await fetchImpl(target, {
        body: undefined,
        headers: {
          accept: "application/json",
          connection: "close",
          [INTERNAL_TOKEN_HEADER]: validatedToken,
        },
        method: "POST",
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        await discardResponse(response);
        return { classification: "redirect_rejected", stopImmediately: true };
      }
      if ([401, 403, 404].includes(response.status)) {
        await discardResponse(response);
        return { classification: "authentication_rejected", stopImmediately: true };
      }
      if (!response.ok) {
        await discardResponse(response);
        return { classification: "bounded_worker_failure" };
      }

      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
        await discardResponse(response);
        return { classification: "bounded_worker_failure" };
      }

      const responseText = await response.text();
      if (Buffer.byteLength(responseText, "utf8") > MAX_RESPONSE_BYTES) {
        return { classification: "bounded_worker_failure" };
      }

      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        return { classification: "bounded_worker_failure" };
      }
      const aggregate = safeAggregatePayload(parsed);
      if (!aggregate) return { classification: "bounded_worker_failure" };

      return {
        aggregate,
        classification:
          aggregate.claimed > 0 ? "worker_accepted" : "no_claimable_jobs",
      };
    } catch {
      if (stopRequested) return { classification: "shutdown" };
      return {
        classification: "local_server_unavailable",
        requestTimedOut: timedOut,
      };
    } finally {
      clearTimeout(timeout);
      inFlight -= 1;
      if (activeAbortController === controller) activeAbortController = null;
    }
  }

  async function run({ maxInvocations = Number.POSITIVE_INFINITY } = {}) {
    if (running) {
      throw new LocalAIJobsWorkerConfigurationError("worker_loop_already_running");
    }
    running = true;
    stopRequested = false;

    let consecutiveFatalFailures = 0;
    let consecutiveUnavailable = 0;
    let invocationCount = 0;
    let reason = "shutdown_requested";

    emit({ status: "local_worker_started" });

    try {
      while (!stopRequested && invocationCount < maxInvocations) {
        invocationCount += 1;
        const result = await invoke();

        if (result.classification === "shutdown") break;

        if (result.classification === "authentication_rejected") {
          reason = "authentication_rejected";
          emit({ invocation: invocationCount, status: result.classification });
          break;
        }
        if (result.classification === "redirect_rejected") {
          reason = "redirect_rejected";
          emit({ invocation: invocationCount, status: result.classification });
          break;
        }

        let nextWakeMs;
        if (result.classification === "worker_accepted") {
          consecutiveFatalFailures = 0;
          consecutiveUnavailable = 0;
          nextWakeMs = activeDelayMs;
          emit({
            claimed: result.aggregate.claimed,
            completed: result.aggregate.completed,
            failed: result.aggregate.failed,
            invocation: invocationCount,
            nextWakeMs,
            retryWaiting: result.aggregate.retryWaiting,
            status: result.classification,
          });
        } else if (result.classification === "no_claimable_jobs") {
          consecutiveFatalFailures = 0;
          consecutiveUnavailable = 0;
          nextWakeMs = idleDelayMs;
          emit({
            claimed: 0,
            completed: 0,
            failed: 0,
            invocation: invocationCount,
            nextWakeMs,
            retryWaiting: 0,
            status: result.classification,
          });
        } else if (result.classification === "local_server_unavailable") {
          consecutiveFatalFailures = 0;
          consecutiveUnavailable += 1;
          nextWakeMs = cappedExponentialDelay(
            consecutiveUnavailable,
            unavailableBackoffBaseMs,
            unavailableBackoffMaxMs,
          );
          emit({
            invocation: invocationCount,
            nextWakeMs,
            status: result.classification,
          });
        } else {
          consecutiveUnavailable = 0;
          consecutiveFatalFailures += 1;
          if (consecutiveFatalFailures >= maxConsecutiveFatalFailures) {
            reason = "bounded_worker_failure_limit_reached";
            emit({
              failures: consecutiveFatalFailures,
              invocation: invocationCount,
              status: reason,
            });
            break;
          }
          nextWakeMs = fatalFailureDelayMs;
          emit({
            failures: consecutiveFatalFailures,
            invocation: invocationCount,
            nextWakeMs,
            status: result.classification,
          });
        }

        if (invocationCount < maxInvocations) {
          await waitForNextInvocation(nextWakeMs);
        }
      }

      if (!stopRequested && invocationCount >= maxInvocations) {
        reason = "max_invocations_reached";
      }
    } finally {
      activeAbortController?.abort();
      activeAbortController = null;
      if (sleepTimer) clearTimeout(sleepTimer);
      sleepTimer = null;
      sleepResolve = null;
      running = false;
      emit({ invocations: invocationCount, status: "local_worker_stopped" });
    }

    return {
      invocationCount,
      maxObservedInFlight,
      reason,
    };
  }

  return {
    getState: () => ({
      activeRequest: Boolean(activeAbortController),
      inFlight,
      maxObservedInFlight,
      running,
      sleeping: Boolean(sleepTimer),
      stopRequested,
    }),
    run,
    stop,
  };
}

async function runFromCommandLine() {
  if (process.argv.length > 2) {
    console.error("LOCAL_AI_JOBS_WORKER_CONFIG_ERROR=command_line_arguments_not_supported");
    process.exitCode = 1;
    return;
  }

  let worker;
  try {
    worker = createLocalAIJobsWorker({
      targetUrl:
        process.env.AI_JOBS_LOCAL_ROUTE_URL ?? DEFAULT_LOCAL_AI_JOBS_ROUTE,
      token: process.env.AI_JOBS_INTERNAL_TOKEN,
    });
  } catch (error) {
    const code =
      error instanceof LocalAIJobsWorkerConfigurationError
        ? error.code
        : "configuration_rejected";
    console.error(`LOCAL_AI_JOBS_WORKER_CONFIG_ERROR=${code}`);
    process.exitCode = 1;
    return;
  }

  const shutdown = () => worker.stop();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    const result = await worker.run();
    if (
      [
        "authentication_rejected",
        "bounded_worker_failure_limit_reached",
        "redirect_rejected",
      ].includes(result.reason)
    ) {
      process.exitCode = 1;
    }
  } finally {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
  }
}

const isDirectInvocation =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectInvocation) {
  await runFromCommandLine();
}
