import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LocalAIJobsWorkerConfigurationError,
  acquireLocalAIJobsWorkerLock,
  createLocalAIJobsWorker,
  resolveLocalAIJobsWorkerMaxInvocations,
  resolveLocalAIJobsWorkerRoute,
  validateLocalAIJobsInternalToken,
  validateLocalAIJobsTargetJobId,
} from "./local-ai-jobs-worker.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const token = "local-worker-smoke-0123456789-abcdef-XYZ";
const targetJobId = "123e4567-e89b-42d3-a456-426614174000";
const workerRoutePath = "/api/internal/ai-jobs/run";

function expectConfigurationError(callback, code) {
  assert.throws(callback, (error) => {
    assert(error instanceof LocalAIJobsWorkerConfigurationError);
    assert.equal(error.code, code);
    return true;
  });
}

async function startServer(handler) {
  const sockets = new Set();
  const server = createServer(handler);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  return {
    close: async () => {
      server.close();
      for (const socket of sockets) socket.destroy();
      await once(server, "close");
    },
    openSocketCount: () => sockets.size,
    url: `http://127.0.0.1:${address.port}/api/internal/ai-jobs/run`,
  };
}

function createResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status: 200,
    ...init,
  });
}

function safeAggregate({
  claimed = 0,
  completed = 0,
  failed = 0,
  providerCleanupFailures = 0,
  providerCleanupRequests = 0,
  providerInferenceAttempts = 0,
  providerInferenceRequests = providerInferenceAttempts,
  providerPollRequests = 0,
  providerUploadRequests = 0,
  retryWaiting = 0,
} = {}) {
  return {
    accepted: true,
    claimed,
    completed,
    failed,
    providerCleanupFailures,
    providerCleanupRequests,
    providerInferenceAttempts,
    providerInferenceRequests,
    providerNetworkRequests:
      providerCleanupRequests +
      providerInferenceRequests +
      providerPollRequests +
      providerUploadRequests,
    providerPollRequests,
    providerUploadRequests,
    retryWaiting,
  };
}

function fastWorker(options) {
  return createLocalAIJobsWorker({
    activeDelayMs: 1,
    fatalFailureDelayMs: 1,
    idleDelayMs: 1,
    maxConsecutiveFatalFailures: 3,
    requestTimeoutMs: 2_000,
    token,
    unavailableBackoffBaseMs: 1,
    unavailableBackoffMaxMs: 4,
    ...options,
  });
}

function configurationCases() {
  assert.equal(
    resolveLocalAIJobsWorkerMaxInvocations(undefined),
    Number.POSITIVE_INFINITY,
  );
  assert.equal(resolveLocalAIJobsWorkerMaxInvocations("1"), 1);
  for (const value of ["", "0", "2", "01", "1 "]) {
    expectConfigurationError(
      () => resolveLocalAIJobsWorkerMaxInvocations(value),
      "max_invocations_contract_rejected",
    );
  }

  for (const target of [
    "http://localhost:3000/api/internal/ai-jobs/run",
    "http://127.0.0.1:3000/api/internal/ai-jobs/run",
    "http://[::1]:3000/api/internal/ai-jobs/run",
    "https://localhost:3443/api/internal/ai-jobs/run",
    "http://127.0.0.1/api/internal/ai-jobs/run",
    "http://localhost:80/api/internal/ai-jobs/run",
    "https://127.0.0.1:443/api/internal/ai-jobs/run",
    "http://[::1]:65535/api/internal/ai-jobs/run",
  ]) {
    assert(resolveLocalAIJobsWorkerRoute(target) instanceof URL);
  }

  for (const target of [
    "https://example.com/api/internal/ai-jobs/run",
    "http://192.168.1.10:3000/api/internal/ai-jobs/run",
    "http://10.0.0.5:3000/api/internal/ai-jobs/run",
  ]) {
    expectConfigurationError(
      () => resolveLocalAIJobsWorkerRoute(target),
      "non_loopback_target_rejected",
    );
  }

  for (const target of [
    `http://2130706433:3000${workerRoutePath}`,
    `http://0x7f000001:3000${workerRoutePath}`,
    `http://017700000001:3000${workerRoutePath}`,
    `http://0177.0.0.1:3000${workerRoutePath}`,
    `http://127.1:3000${workerRoutePath}`,
    `http://127.0.1:3000${workerRoutePath}`,
    `http://127.0.0.01:3000${workerRoutePath}`,
    `http://[0:0:0:0:0:0:0:1]:3000${workerRoutePath}`,
    `http://[::ffff:127.0.0.1]:3000${workerRoutePath}`,
    `http://localhost.:3000${workerRoutePath}`,
    `http://xn--loclhost-8fg:3000${workerRoutePath}`,
  ]) {
    expectConfigurationError(
      () => resolveLocalAIJobsWorkerRoute(target),
      "non_loopback_target_rejected",
    );
  }

  for (const target of [
    `http://%6cocalhost:3000${workerRoutePath}`,
    `http://local%68ost:3000${workerRoutePath}`,
    `http://%31%32%37.0.0.1:3000${workerRoutePath}`,
    `http://127%2e0%2e0%2e1:3000${workerRoutePath}`,
    `http://localhost\\@example.com:3000${workerRoutePath}`,
    `http://localhost:3000/%2fapi/internal/ai-jobs/run`,
    `http://localhost:3000/%5capi/internal/ai-jobs/run`,
    `http://loc\u0430lhost:3000${workerRoutePath}`,
    `http://localhost:03000${workerRoutePath}`,
    `http://localhost:65536${workerRoutePath}`,
    `http://localhost:3000${workerRoutePath}\n`,
    ` http://localhost:3000${workerRoutePath}`,
    `http://localhost:3000${workerRoutePath} `,
  ]) {
    expectConfigurationError(
      () => resolveLocalAIJobsWorkerRoute(target),
      "local_route_raw_contract_rejected",
    );
  }

  expectConfigurationError(
    () => resolveLocalAIJobsWorkerRoute("http://127.0.0.1:3000/other"),
    "local_route_contract_rejected",
  );
  expectConfigurationError(
    () => resolveLocalAIJobsWorkerRoute("http://user:pass@127.0.0.1:3000/api/internal/ai-jobs/run"),
    "credential_bearing_url_rejected",
  );
  expectConfigurationError(
    () => resolveLocalAIJobsWorkerRoute(`//localhost:3000${workerRoutePath}`),
    "local_route_url_invalid",
  );
  expectConfigurationError(
    () => resolveLocalAIJobsWorkerRoute(`ftp://localhost:3000${workerRoutePath}`),
    "local_route_protocol_rejected",
  );
  expectConfigurationError(
    () => resolveLocalAIJobsWorkerRoute(`http://localhost:3000${workerRoutePath}?wake=1`),
    "local_route_contract_rejected",
  );
  expectConfigurationError(
    () => resolveLocalAIJobsWorkerRoute(`http://localhost:3000${workerRoutePath}#wake`),
    "local_route_contract_rejected",
  );
  expectConfigurationError(
    () => validateLocalAIJobsInternalToken(undefined),
    "internal_token_missing",
  );
  expectConfigurationError(
    () => validateLocalAIJobsInternalToken("short"),
    "internal_token_malformed",
  );
  expectConfigurationError(
    () => validateLocalAIJobsInternalToken("replace-with-a-long-random-token-before-running"),
    "internal_token_placeholder_rejected",
  );
  assert.equal(validateLocalAIJobsInternalToken(token), token);
  assert.equal(validateLocalAIJobsTargetJobId(undefined), null);
  assert.equal(validateLocalAIJobsTargetJobId(targetJobId), targetJobId);
  for (const value of ["", "not-a-uuid", targetJobId.toUpperCase(), `${targetJobId} `]) {
    expectConfigurationError(
      () => validateLocalAIJobsTargetJobId(value),
      "target_job_id_rejected",
    );
  }
}

async function requestContractCase() {
  const logs = [];
  let body = "";
  let receivedTargetJobId = null;
  let receivedToken = null;
  let requestCount = 0;
  const local = await startServer((request, response) => {
    requestCount += 1;
    receivedToken = request.headers["x-ai-jobs-internal-token"];
    receivedTargetJobId = request.headers["x-pdf50-provider-test-job-id"];
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      response.writeHead(200, {
        "connection": "close",
        "content-type": "application/json",
      });
      response.end(
        JSON.stringify(safeAggregate({
          claimed: 1,
          completed: 1,
          providerCleanupRequests: 1,
          providerInferenceAttempts: 1,
          providerUploadRequests: 2,
        })),
      );
    });
  });

  try {
    const worker = fastWorker({
      logger: (line) => logs.push(line),
      targetJobId,
      targetUrl: local.url,
    });
    const result = await worker.run({ maxInvocations: 1 });
    assert.equal(result.reason, "max_invocations_reached");
    assert.equal(result.maxObservedInFlight, 1);
    assert.equal(requestCount, 1);
    assert.equal(receivedToken, token);
    assert.equal(receivedTargetJobId, targetJobId);
    assert.equal(body, "");
    assert(logs.some((line) => line.includes("status=worker_accepted")));
    assert(logs.some((line) => line.includes("providerInferenceAttempts=1")));
    assert(logs.some((line) => line.includes("providerInferenceRequests=1")));
    assert(logs.some((line) => line.includes("providerNetworkRequests=4")));
    assert(logs.every((line) => !line.includes(token)));
    assert.deepEqual(worker.getState(), {
      activeRequest: false,
      inFlight: 0,
      maxObservedInFlight: 1,
      running: false,
      sleeping: false,
      stopRequested: false,
    });
    for (let attempt = 0; attempt < 10 && local.openSocketCount() > 0; attempt += 1) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    }
    assert.equal(local.openSocketCount(), 0);
  } finally {
    await local.close();
  }
}

async function serialAndPollingCases() {
  let activeRequests = 0;
  let maxActiveRequests = 0;
  let requestCount = 0;
  const pollingResults = [];
  const local = await startServer(async (_request, response) => {
    requestCount += 1;
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
    const claimed = requestCount === 1 ? 1 : 0;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify(safeAggregate({
        claimed,
        completed: claimed,
      })),
    );
    activeRequests -= 1;
  });

  try {
    const worker = fastWorker({
      activeDelayMs: 2,
      idleDelayMs: 4,
      logger: (line) => {
        const delay = Number(line.match(/nextWakeMs=(\d+)/)?.[1]);
        if (line.includes("status=worker_accepted")) {
          pollingResults.push(["active", delay]);
        }
        if (line.includes("status=no_claimable_jobs")) {
          pollingResults.push(["idle", delay]);
        }
      },
      targetUrl: local.url,
    });
    const result = await worker.run({ maxInvocations: 3 });
    assert.equal(requestCount, 3);
    assert.equal(maxActiveRequests, 1);
    assert.equal(result.maxObservedInFlight, 1);
    assert.deepEqual(pollingResults, [
      ["active", 2],
      ["idle", 4],
      ["idle", 4],
    ]);
  } finally {
    await local.close();
  }
}

async function redirectAndAuthenticationCases() {
  const redirectLogs = [];
  let redirectedRequestCount = 0;
  const redirectServer = await startServer((_request, response) => {
    redirectedRequestCount += 1;
    response.writeHead(302, { location: "https://example.com/internal-worker" });
    response.end();
  });

  try {
    const worker = fastWorker({
      logger: (line) => redirectLogs.push(line),
      targetUrl: redirectServer.url,
    });
    const result = await worker.run({ maxInvocations: 5 });
    assert.equal(result.reason, "redirect_rejected");
    assert.equal(redirectedRequestCount, 1);
    assert(redirectLogs.some((line) => line.includes("status=redirect_rejected")));
  } finally {
    await redirectServer.close();
  }

  let authenticationRequests = 0;
  const authenticationWorker = fastWorker({
    fetchImpl: async () => {
      authenticationRequests += 1;
      return new Response(null, { status: 404 });
    },
    logger: () => undefined,
  });
  const authenticationResult = await authenticationWorker.run({ maxInvocations: 5 });
  assert.equal(authenticationResult.reason, "authentication_rejected");
  assert.equal(authenticationRequests, 1);
}

async function backoffAndFatalFailureCases() {
  const oneShotLogs = [];
  const oneShotWorker = fastWorker({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          accepted: false,
          reason: "trusted_provider_test_claim_update_failed",
        }),
        { status: 503 },
      ),
    logger: (line) => oneShotLogs.push(line),
  });
  const oneShotResult = await oneShotWorker.run({ maxInvocations: 1 });
  assert.equal(oneShotResult.reason, "bounded_worker_failure");
  assert(
    oneShotLogs.some((line) =>
      line.includes("safeReason=trusted_provider_test_claim_update_failed"),
    ),
  );

  const unavailableDelays = [];
  let unavailableRequests = 0;
  const unavailableWorker = fastWorker({
    fetchImpl: async () => {
      unavailableRequests += 1;
      throw new TypeError("sanitized local connection failure");
    },
    logger: (line) => {
      if (!line.includes("status=local_server_unavailable")) return;
      const match = line.match(/nextWakeMs=(\d+)/);
      if (match) unavailableDelays.push(Number(match[1]));
    },
  });
  const unavailableResult = await unavailableWorker.run({ maxInvocations: 4 });
  assert.equal(unavailableResult.reason, "local_server_unavailable");
  assert.equal(unavailableRequests, 4);
  assert.deepEqual(unavailableDelays, [1, 2, 4, 4]);

  let fatalRequests = 0;
  const fatalWorker = fastWorker({
    fetchImpl: async () => {
      fatalRequests += 1;
      return new Response(null, { status: 503 });
    },
    logger: () => undefined,
  });
  const fatalResult = await fatalWorker.run({ maxInvocations: 10 });
  assert.equal(fatalResult.reason, "bounded_worker_failure_limit_reached");
  assert.equal(fatalRequests, 3);
}

async function timeoutAndEchoLeakCases() {
  let observedAbort = false;
  const timeoutLogs = [];
  const timeoutWorker = fastWorker({
    fetchImpl: (_url, init) =>
      new Promise((_resolveRequest, rejectRequest) => {
        init.signal.addEventListener(
          "abort",
          () => {
            observedAbort = true;
            rejectRequest(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
    logger: (line) => timeoutLogs.push(line),
    requestTimeoutMs: 10,
  });
  const timeoutResult = await timeoutWorker.run({ maxInvocations: 1 });
  assert.equal(timeoutResult.reason, "local_server_unavailable");
  assert(observedAbort);
  assert(timeoutLogs.some((line) => line.includes("status=local_server_unavailable")));
  assert.equal(timeoutWorker.getState().inFlight, 0);

  const echoLogs = [];
  const echoWorker = fastWorker({
    fetchImpl: async (_url, init) =>
      new Response(
        JSON.stringify({
          accepted: false,
          echoed: init.headers["x-ai-jobs-internal-token"],
        }),
        { status: 200 },
      ),
    logger: (line) => echoLogs.push(line),
  });
  const echoResult = await echoWorker.run({ maxInvocations: 5 });
  assert.equal(echoResult.reason, "bounded_worker_failure_limit_reached");
  assert(echoLogs.every((line) => !line.includes(token)));
}

async function independentRunnerInstanceLimitationCase() {
  let activeRequests = 0;
  let maxActiveRequests = 0;
  let releaseRequests;
  const requestGate = new Promise((resolveRequestGate) => {
    releaseRequests = resolveRequestGate;
  });
  const fetchImpl = async () => {
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    await requestGate;
    activeRequests -= 1;
    return createResponse(safeAggregate());
  };

  const firstWorker = fastWorker({ fetchImpl, logger: () => undefined });
  const secondWorker = fastWorker({ fetchImpl, logger: () => undefined });
  const firstRun = firstWorker.run({ maxInvocations: 1 });
  const secondRun = secondWorker.run({ maxInvocations: 1 });
  for (let attempt = 0; attempt < 100 && activeRequests < 2; attempt += 1) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2));
  }
  releaseRequests();
  const [firstResult, secondResult] = await Promise.all([firstRun, secondRun]);

  assert.equal(maxActiveRequests, 2);
  assert.equal(firstResult.maxObservedInFlight, 1);
  assert.equal(secondResult.maxObservedInFlight, 1);
}

async function gracefulShutdownCase() {
  let observedAbort = false;
  const worker = fastWorker({
    fetchImpl: (_url, init) =>
      new Promise((_resolveRequest, rejectRequest) => {
        init.signal.addEventListener(
          "abort",
          () => {
            observedAbort = true;
            rejectRequest(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
    logger: () => undefined,
  });
  const running = worker.run();
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
  await assert.rejects(worker.run(), (error) => {
    assert(error instanceof LocalAIJobsWorkerConfigurationError);
    assert.equal(error.code, "worker_loop_already_running");
    return true;
  });
  worker.stop();
  const result = await running;
  assert.equal(result.reason, "shutdown_requested");
  assert(observedAbort);
  assert.equal(worker.getState().activeRequest, false);
  assert.equal(worker.getState().sleeping, false);
  assert.equal(worker.getState().inFlight, 0);
}

async function operatingSystemSingletonCase() {
  const lockDirectory = await mkdtemp(resolve(tmpdir(), "edustruct-worker-lock-"));
  try {
    const first = await acquireLocalAIJobsWorkerLock({
      isProcessAlive: (processId) => processId === 10_001,
      lockDirectory,
      processId: 10_001,
    });
    await assert.rejects(
      acquireLocalAIJobsWorkerLock({
        isProcessAlive: (processId) => processId === 10_001,
        lockDirectory,
        processId: 10_002,
      }),
      (error) => {
        assert(error instanceof LocalAIJobsWorkerConfigurationError);
        assert.equal(error.code, "worker_instance_already_running");
        return true;
      },
    );
    await first.release();

    const stale = await acquireLocalAIJobsWorkerLock({
      isProcessAlive: () => false,
      lockDirectory,
      processId: 10_003,
    });
    const recovered = await acquireLocalAIJobsWorkerLock({
      isProcessAlive: () => false,
      lockDirectory,
      processId: 10_004,
    });
    await stale.release();
    await recovered.release();

    const reacquired = await acquireLocalAIJobsWorkerLock({
      isProcessAlive: () => false,
      lockDirectory,
      processId: 10_005,
    });
    await reacquired.release();

    const staleSeed = await acquireLocalAIJobsWorkerLock({
      isProcessAlive: () => true,
      lockDirectory,
      processId: 11_000,
    });
    const contenders = await Promise.allSettled([
      acquireLocalAIJobsWorkerLock({
        isProcessAlive: (processId) => processId !== 11_000,
        lockDirectory,
        processId: 11_001,
      }),
      acquireLocalAIJobsWorkerLock({
        isProcessAlive: (processId) => processId !== 11_000,
        lockDirectory,
        processId: 11_002,
      }),
    ]);
    const winners = contenders.filter((result) => result.status === "fulfilled");
    assert.equal(winners.length, 1, "stale-lock takeover must have one winner");
    await staleSeed.release();
    await winners[0].value.release();
  } finally {
    await rm(lockDirectory, { force: true, recursive: true });
  }
}

async function sourceBoundaryCases() {
  const [runner, route, worker, policy, claimMigration, packageJson, runbook] = await Promise.all([
    readFile(resolve(root, "scripts/local-ai-jobs-worker.mjs"), "utf8"),
    readFile(resolve(root, "src/app/api/internal/ai-jobs/run/route.ts"), "utf8"),
    readFile(resolve(root, "src/lib/ai-jobs/worker.ts"), "utf8"),
    readFile(resolve(root, "src/lib/ai-jobs/policy.ts"), "utf8"),
    readFile(
      resolve(root, "supabase/clean-migrations/0038_ai_pdf_coverage_recovery_jobs.sql"),
      "utf8",
    ),
    readFile(resolve(root, "package.json"), "utf8"),
    readFile(resolve(root, "docs/runbooks/local-ai-jobs-worker.md"), "utf8"),
  ]);

  assert(
    route.includes("runDurableAIProviderJobs({") &&
      route.includes("limit: providerTestLimits ? 1 : 2") &&
      route.includes("providerTestLimits") &&
      route.includes("PDF50_PROVIDER_TEST_JOB_HEADER") &&
      route.includes("targetJobId"),
  );
  assert(!route.includes("request.json("));
  assert(worker.includes("Math.min(limit, 2, control.maxJobsPerInvocation)"));
  assert(worker.includes("claimTrustedProviderTestJob"));
  assert(worker.includes("trusted_provider_test_target_required"));
  assert(worker.includes("if (!providerTestLimits)"));
  assert(policy.includes("ai_pdf_extract: 1"));
  assert(
    claimMigration.includes("claimed_job.job_kind = 'ai_pdf_extract' and active_pdf >= 1"),
  );
  assert(runner.includes('redirect: "manual"'));
  assert(runner.includes('process.once("SIGINT", shutdown)'));
  assert(runner.includes('mkdir(lockPath, { mode: 0o700 })'));
  assert(runner.includes("await rename(lockPath, stalePath)"));
  assert(runner.includes("worker_instance_already_running"));
  assert(runner.includes("AI_JOBS_INTERNAL_TOKEN"));
  assert(runner.includes("AI_JOBS_LOCAL_MAX_INVOCATIONS"));
  assert(runner.includes("AI_JOBS_LOCAL_TARGET_JOB_ID"));
  assert(runner.includes("x-pdf50-provider-test-job-id"));
  assert(runner.includes("readSafeRouteFailure"));
  assert(runner.includes('"bounded_worker_failure"'));
  assert(runner.includes("resolveLocalAIJobsWorkerMaxInvocations"));
  assert(!runner.includes("dotenv"));
  assert(!runner.includes("request.json"));
  assert.equal(JSON.parse(packageJson).scripts["worker:dev"], "node scripts/local-ai-jobs-worker.mjs");
  assert(runbook.includes("Only one `npm run worker:dev` process should be active at a time"));
  assert(runbook.includes("operating-system-wide lock"));
  assert(runbook.includes("A second terminal fails closed"));
}

configurationCases();
await requestContractCase();
await serialAndPollingCases();
await redirectAndAuthenticationCases();
await backoffAndFatalFailureCases();
await timeoutAndEchoLeakCases();
await gracefulShutdownCase();
await independentRunnerInstanceLimitationCase();
await operatingSystemSingletonCase();
await sourceBoundaryCases();

console.log(
  "PASS local AI jobs worker smoke: NONCANONICAL_LOOPBACK_ALIASES_FAIL_BEFORE_URL_CANONICALIZATION / LOCAL_WORKER_RUNNER_CANNOT_TARGET_REMOTE_DEPLOYMENTS",
);
