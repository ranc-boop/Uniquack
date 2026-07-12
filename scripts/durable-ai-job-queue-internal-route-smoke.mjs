import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const hasReactServerCondition = process.execArgv.some(
  (arg) => arg === "--conditions=react-server" || arg === "-Creact-server",
);

if (!process.env.O2I_QUEUE_ROUTE_SMOKE_REEXECED && !hasReactServerCondition) {
  const scriptPath = fileURLToPath(import.meta.url);
  const child = spawnSync(
    process.execPath,
    [...process.execArgv, "--conditions=react-server", scriptPath],
    {
      env: { ...process.env, O2I_QUEUE_ROUTE_SMOKE_REEXECED: "1" },
      stdio: "inherit",
    },
  );
  process.exit(child.status ?? 1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(root, ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const testToken = "local-durable-ai-job-route-validation";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(url && serviceRoleKey, "Missing clean Supabase URL or service-role key.");

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: outstanding, error: outstandingError } = await supabase
    .from("ai_provider_jobs")
    .select("id")
    .in("status", ["queued", "leased", "processing", "retry_wait"]);
  assert(!outstandingError, "Unable to check queue safety before route smoke.");
  assert(
    !(outstanding ?? []).length,
    "Internal route smoke will not run while pre-existing queue work exists.",
  );

  process.env.AI_JOBS_INTERNAL_TOKEN = testToken;
  const require = createRequire(import.meta.url);
  const jiti = require("jiti")(import.meta.url, {
    alias: { "@": resolve(root, "src") },
  });
  const { POST } = jiti("../src/app/api/internal/ai-jobs/run/route.ts");

  const missingToken = await POST(
    new Request("http://localhost/api/internal/ai-jobs/run", { method: "POST" }),
  );
  assert(missingToken.status === 404, "unauthenticated internal worker request was not rejected");

  const ordinaryUser = await POST(
    new Request("http://localhost/api/internal/ai-jobs/run", {
      headers: { Authorization: "Bearer ordinary-user-session" },
      method: "POST",
    }),
  );
  assert(ordinaryUser.status === 404, "normal user request was not rejected");

  const wrongToken = await POST(
    new Request("http://localhost/api/internal/ai-jobs/run", {
      headers: { "x-ai-jobs-internal-token": "wrong" },
      method: "POST",
    }),
  );
  assert(wrongToken.status === 404, "wrong internal worker token was not rejected");

  const trusted = await POST(
    new Request("http://localhost/api/internal/ai-jobs/run", {
      body: JSON.stringify({ arbitraryJobDefinition: true }),
      headers: {
        "content-type": "application/json",
        "x-ai-jobs-internal-token": testToken,
      },
      method: "POST",
    }),
  );
  assert(trusted.status === 200, "trusted internal worker request was rejected");
  const payload = await trusted.json();
  assert(
    payload?.accepted === true &&
      payload.claimed === 0 &&
      payload.completed === 0 &&
      payload.failed === 0 &&
      payload.retryWaiting === 0,
    "trusted route returned unexpected queue detail or processed work unexpectedly",
  );
  assert(
    Object.keys(payload).every((key) =>
      ["accepted", "claimed", "completed", "failed", "retryWaiting"].includes(key),
    ),
    "trusted route response exposed more than bounded aggregate status",
  );

  delete process.env.AI_JOBS_INTERNAL_TOKEN;
  console.log("PASS durable AI job queue internal worker route smoke");
}

await main();
