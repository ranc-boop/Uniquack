#!/usr/bin/env node

import { createHash } from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const REQUIRED_CONFIRM = "SETUP_CLEAN_PROVIDER_GATEWAY";
const KNOWN_LEGACY_PROJECT_IDS = new Set(["jiavtschssmcjvzhgdlk"]);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    fail(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseSupabaseUrl(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      fail("Supabase URL must use https.");
    }

    if (!url.hostname.endsWith(".supabase.co")) {
      fail("Supabase URL must target a Supabase project host.");
    }

    const projectId = url.hostname.split(".")[0];

    if (KNOWN_LEGACY_PROJECT_IDS.has(projectId)) {
      fail("Refusing to write provider gateway setup to the known legacy Supabase project.");
    }

    return { hostname: url.hostname, projectId };
  } catch (error) {
    fail(`Supabase URL is invalid: ${error.message}`);
  }
}

async function main() {
  if (process.env.CLEAN_PROVIDER_GATEWAY_CONFIRM !== REQUIRED_CONFIRM) {
    fail(
      `Refusing to run without CLEAN_PROVIDER_GATEWAY_CONFIRM=${REQUIRED_CONFIRM}`,
    );
  }

  const supabaseUrl =
    process.env.CLEAN_SUPABASE_URL?.trim() ||
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requiredEnv("CLEAN_SUPABASE_SERVICE_ROLE_KEY");
  const gatewayToken = requiredEnv("AI_PROVIDER_GATEWAY_TOKEN");
  const target = parseSupabaseUrl(supabaseUrl);
  const tokenHash = createHash("sha256").update(gatewayToken, "utf8").digest("hex");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const setup = await supabase.rpc("setup_ai_provider_gateway_token_hash", {
    token_hash: tokenHash,
    token_label: "local clean Supabase provider gateway token",
  });

  if (setup.error) {
    fail(`Could not call provider gateway setup RPC: ${setup.error.message}`);
  }

  const result = Array.isArray(setup.data) ? setup.data[0] : setup.data;
  const action =
    typeof result?.action === "string" ? result.action : "setup_rpc_completed";
  const rowsAffected =
    Number.isFinite(Number(result?.rows_affected)) &&
    Number(result?.rows_affected) >= 0
      ? Number(result.rows_affected)
      : 0;

  console.log("Provider gateway token hash setup completed.");
  console.log(`targetProject: ${target.projectId}`);
  console.log(`action: ${action}`);
  console.log(`rowsAffected: ${rowsAffected}`);
  console.log("storedRawGatewayToken: false");
}

await main();
