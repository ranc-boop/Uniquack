#!/usr/bin/env node
// Authorization-matrix test seeding — LOCAL DISPOSABLE STACK ONLY.
// Creates 2 tenants (T1, T2) and 6 accounts spanning the role/owner/tenant
// axes from docs/security/authz-matrix-test-design.md.
//
// Safety: refuses to run against a non-local Supabase URL. Uses the Auth admin
// API for password hashing; profiles/memberships inserted with the service role
// (bypasses RLS by design, for setup only).
//
// Run: node scripts/authz-matrix-test-seed.mjs

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.test loader (avoids depending on dotenv's file precedence).
function loadEnv(file) {
  const out = {};
  for (const line of readFileSync(resolve(root, file), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnv(".env.test");
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!/127\.0\.0\.1|localhost/.test(SUPABASE_URL || "")) {
  throw new Error(
    `Refusing to seed non-local target: ${SUPABASE_URL}. Local-only script.`,
  );
}
if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing in .env.test");

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const T1 = "11111111-1111-4111-8111-111111111111"; // existing seeded org
const T2 = "22222222-2222-4222-8222-222222222222";
const PASSWORD = "AuthzTest!2026";

// role = profiles.role; memberRole = organization_members.role (no super_admin).
const ACCOUNTS = [
  { key: "STUDENT",          email: "student@test.local",     username: "student_t1",     role: "student",     memberRole: "student", org: T1 },
  { key: "TEACHER",          email: "teacher-a@test.local",   username: "teacher_a_t1",   role: "teacher",     memberRole: "teacher", org: T1 },
  { key: "TEACHER_B",        email: "teacher-b@test.local",   username: "teacher_b_t1",   role: "teacher",     memberRole: "teacher", org: T1 },
  { key: "UNRELATED_TEACHER",email: "teacher-t2@test.local",  username: "teacher_t2",     role: "teacher",     memberRole: "teacher", org: T2 },
  { key: "ADMIN",            email: "admin@test.local",       username: "admin_t1",       role: "admin",       memberRole: "admin",   org: T1 },
  { key: "SUPER_ADMIN",      email: "super-admin@test.local", username: "super_admin_t1", role: "super_admin", memberRole: "admin",   org: T1 },
];

async function ensureOrgT2() {
  const { error } = await admin.from("organizations").upsert(
    { id: T2, name: "EduStruct T2 Disposable", slug: "edustruct-t2", status: "active" },
    { onConflict: "id" },
  );
  if (error) throw new Error(`org T2 upsert: ${error.message}`);
  console.log("org T2 ready");
}

async function findUserByEmail(email) {
  // admin.listUsers is paginated; small dataset so page 1 suffices.
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  return data.users.find((u) => u.email === email) || null;
}

async function ensureAuthUser(a) {
  const existing = await findUserByEmail(a.email);
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: a.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { seeded_by: "authz-matrix-test" },
  });
  if (error) throw new Error(`createUser ${a.email}: ${error.message}`);
  return data.user.id;
}

async function upsertProfile(id, a) {
  const { error } = await admin.from("profiles").upsert(
    {
      id,
      username: a.username,
      email: a.email,
      full_name: a.username,
      role: a.role,
      status: "active",
      default_organization_id: a.org,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(`profile ${a.email}: ${error.message}`);
}

async function upsertMembership(id, a) {
  const { error } = await admin.from("organization_members").upsert(
    { organization_id: a.org, user_id: id, role: a.memberRole, status: "active" },
    { onConflict: "organization_id,user_id" },
  );
  if (error) throw new Error(`membership ${a.email}: ${error.message}`);
}

async function main() {
  await ensureOrgT2();
  const summary = [];
  for (const a of ACCOUNTS) {
    const id = await ensureAuthUser(a);
    await upsertProfile(id, a);
    await upsertMembership(id, a);
    summary.push({ key: a.key, email: a.email, role: a.role, org: a.org === T1 ? "T1" : "T2", id });
    console.log(`✓ ${a.key.padEnd(18)} ${a.email.padEnd(24)} role=${a.role} org=${a.org === T1 ? "T1" : "T2"}`);
  }
  console.log("\nAll 6 accounts seeded. Password for all:", PASSWORD);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error("SEED FAILED:", e.message);
  process.exit(1);
});
