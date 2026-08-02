import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LocalAIJobsWorkerConfigurationError,
  createLocalAIJobsWorker,
  resolveLocalAIJobsWorkerRoute,
  validateLocalAIJobsInternalToken,
} from "./local-ai-jobs-worker.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const token = "local-worker-smoke-0123456789-abcdef-XYZ";

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
  for (const target of [
    "http://localhost:3000/api/internal/ai-jobs/run",
    "http://127.0.0.1:3000/api/internal/ai-jobs/run",
    "http://[::1]:3000/api/internal/ai-jobs/run",
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

  expectConfigurationError(
    () => resolveLocalAIJobsWorkerRoute("http://127.0.0.1:3000/other"),
    "local_route_contract_rejected",
  );
  expectConfigurationError(
    () => resolveLocalAIJobsWorkerRoute("http://user:pass@127.0.0.1:3000/api/internal/ai-jobs/run"),
    "credential_bearing_url_rejected",
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
}

async function requestContractCase() {
  const logs = [];
  let body = "";
  let receivedToken = null;
  let requestCount = 0;
  const local = await startServer((request, response) => {
    requestCount += 1;
    receivedToken = request.headers["x-ai-jobs-internal-token"];
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
        JSON.stringify({
          accepted: true,
          claimed: 1,
          completed: 1,
          failed: 0,
          retryWaiting: 0,
        }),
      );
    });
  });

  try {
    const worker = fastWorker({ logger: (line) => logs.push(line), targetUrl: local.url });
    const result = await worker.run({ maxInvocations: 1 });
    assert.equal(result.reason, "max_invocations_reached");
    assert.equal(result.maxObservedInFlight, 1);
    assert.equal(requestCount, 1);
    assert.equal(receivedToken, token);
    assert.equal(body, "");
    assert(logs.some((line) => line.includes("status=worker_accepted")));
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
      JSON.stringify({
        accepted: true,
        claimed,
        completed: claimed,
        failed: 0,
        retryWaiting: 0,
      }),
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
  assert.equal(unavailableResult.reason, "max_invocations_reached");
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

async function sourceBoundaryCases() {
  const [runner, route, worker, policy, claimMigration, packageJson] = await Promise.all([
    readFile(resolve(root, "scripts/local-ai-jobs-worker.mjs"), "utf8"),
    readFile(resolve(root, "src/app/api/internal/ai-jobs/run/route.ts"), "utf8"),
    readFile(resolve(root, "src/lib/ai-jobs/worker.ts"), "utf8"),
    readFile(resolve(root, "src/lib/ai-jobs/policy.ts"), "utf8"),
    readFile(
      resolve(root, "supabase/clean-migrations/0038_ai_pdf_coverage_recovery_jobs.sql"),
      "utf8",
    ),
    readFile(resolve(root, "package.json"), "utf8"),
  ]);

  assert(route.includes("runDurableAIProviderJobs({ limit: 2 })"));
  assert(!route.includes("request.json("));
  assert(worker.includes("Math.min(limit, 2, control.maxJobsPerInvocation)"));
  assert(policy.includes("ai_pdf_extract: 1"));
  assert(
    claimMigration.includes("claimed_job.job_kind = 'ai_pdf_extract' and active_pdf >= 1"),
  );
  assert(runner.includes('redirect: "manual"'));
  assert(runner.includes('process.once("SIGINT", shutdown)'));
  assert(runner.includes("AI_JOBS_INTERNAL_TOKEN"));
  assert(!runner.includes("dotenv"));
  assert(!runner.includes("request.json"));
  assert.equal(JSON.parse(packageJson).scripts["worker:dev"], "node scripts/local-ai-jobs-worker.mjs");
}

configurationCases();
await requestContractCase();
await serialAndPollingCases();
await redirectAndAuthenticationCases();
await backoffAndFatalFailureCases();
await gracefulShutdownCase();
await sourceBoundaryCases();

console.log(
  "PASS local AI jobs worker smoke: LOCAL_WORKER_RUNNER_CANNOT_TARGET_REMOTE_DEPLOYMENTS",
);
