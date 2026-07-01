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

function formatSupabaseError(error) {
  if (!error?.message) {
    return "Unknown Supabase error.";
  }

  if (/invalid schema:\s*private/i.test(error.message)) {
    return [
      "The private schema is not exposed through Supabase PostgREST.",
      "This project needs a service-role-only setup RPC/migration or a one-off SQL editor setup step before this helper can write the gateway hash.",
    ].join(" ");
  }

  return error.message;
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
      fail("NEXT_PUBLIC_SUPABASE_URL must use https.");
    }

    if (!url.hostname.endsWith(".supabase.co")) {
      fail("NEXT_PUBLIC_SUPABASE_URL must target a Supabase project host.");
    }

    const projectId = url.hostname.split(".")[0];

    if (KNOWN_LEGACY_PROJECT_IDS.has(projectId)) {
      fail("Refusing to write provider gateway setup to the known legacy Supabase project.");
    }

    return { hostname: url.hostname, projectId };
  } catch (error) {
    fail(`NEXT_PUBLIC_SUPABASE_URL is invalid: ${error.message}`);
  }
}

async function main() {
  if (process.env.CLEAN_PROVIDER_GATEWAY_CONFIRM !== REQUIRED_CONFIRM) {
    fail(
      `Refusing to run without CLEAN_PROVIDER_GATEWAY_CONFIRM=${REQUIRED_CONFIRM}`,
    );
  }

  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
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

  const gatewayHashes = supabase
    .schema("private")
    .from("ai_provider_gateway_token_hashes");
  const existing = await gatewayHashes
    .select("token_hash,status")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (existing.error) {
    fail(`Could not inspect provider gateway hash row: ${formatSupabaseError(existing.error)}`);
  }

  const action = existing.data ? "updated_existing_hash_row" : "inserted_hash_row";
  const upsert = await gatewayHashes.upsert(
    {
      disabled_at: null,
      label: "local clean Supabase provider gateway token",
      status: "active",
      token_hash: tokenHash,
    },
    { onConflict: "token_hash" },
  );

  if (upsert.error) {
    fail(`Could not upsert provider gateway hash row: ${formatSupabaseError(upsert.error)}`);
  }

  console.log("Provider gateway token hash setup completed.");
  console.log(`targetProject: ${target.projectId}`);
  console.log(`action: ${action}`);
  console.log("rowsAffected: 1");
  console.log("storedRawGatewayToken: false");
}

await main();
