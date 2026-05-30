import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { createBrowserClient } from "@supabase/ssr";

const envPath = resolve(process.cwd(), ".env.local");

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");
    process.env[key] ??= rest.join("=").replace(/^['"]|['"]$/g, "");
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase URL or anon key.");
}

function usernameToEmail(username) {
  return username.includes("@")
    ? username
    : `${username.trim().toLowerCase()}@local.app`;
}

function createClientAndCookieJar() {
  const jar = new Map();
  const client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        return jar.get(name);
      },
      set(name, value) {
        jar.set(name, value);
      },
      remove(name) {
        jar.delete(name);
      },
    },
  });

  return { client, jar };
}

async function sessionCookies(usernameEnv, passwordEnv) {
  const username = process.env[usernameEnv];
  const password = process.env[passwordEnv];

  if (!username || !password) {
    throw new Error(`Missing ${usernameEnv} or ${passwordEnv}.`);
  }

  const { client, jar } = createClientAndCookieJar();
  const { error } = await client.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });

  if (error) {
    throw new Error(`${usernameEnv} sign-in failed: ${error.message}`);
  }

  return [...jar.entries()]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("; ");
}

async function fetchRoute(path, cookie = "") {
  const response = await fetch(`http://127.0.0.1:3000${path}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });

  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    text: await response.text(),
  };
}

function assertRoute(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`PASS ${message}`);
}

const studentCookie = await sessionCookies(
  "TEST_STUDENT_USERNAME",
  "TEST_STUDENT_PASSWORD",
);
const adminCookie = await sessionCookies(
  "TEST_ADMIN_USERNAME",
  "TEST_ADMIN_PASSWORD",
);
const superAdminCookie = await sessionCookies(
  "TEST_SUPER_ADMIN_USERNAME",
  "TEST_SUPER_ADMIN_PASSWORD",
);

const home = await fetchRoute("/");
const questions = await fetchRoute("/questions?q=AP&min=0&max=1000");
const videos = await fetchRoute("/videos?q=AP&min=0&max=1000");
const signedOutAdmin = await fetchRoute("/admin");
const studentAdmin = await fetchRoute("/admin", studentCookie);
const adminHome = await fetchRoute("/admin", adminCookie);
const adminUsers = await fetchRoute("/admin/users", adminCookie);
const superAdminUsers = await fetchRoute("/admin/users", superAdminCookie);

assertRoute(
  home.status === 200 &&
    home.text.includes("AI-powered AP content management platform"),
  "home renders product positioning",
);
assertRoute(
  questions.status === 200 &&
    questions.text.includes("Published AP questions") &&
    questions.text.includes("Filter"),
  "questions page renders filters",
);
assertRoute(
  videos.status === 200 &&
    videos.text.includes("Published video explanations") &&
    videos.text.includes("Filter"),
  "videos page renders filters",
);
assertRoute(
  signedOutAdmin.status === 307 &&
    signedOutAdmin.location.includes("/auth/login"),
  "signed out user visiting /admin redirects to login",
);
assertRoute(
  studentAdmin.status === 307 && studentAdmin.location.includes("/unauthorized"),
  "student visiting /admin redirects to unauthorized",
);
assertRoute(
  adminHome.status === 200 && adminHome.text.includes("Create demo records"),
  "admin can access dashboard and demo seed action",
);
assertRoute(
  adminUsers.status === 307 && adminUsers.location.includes("/unauthorized"),
  "admin is blocked from /admin/users",
);
assertRoute(
  superAdminUsers.status === 200 && superAdminUsers.text.includes("Update role"),
  "super_admin can access /admin/users",
);

console.log("Route smoke test completed.");
