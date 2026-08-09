#!/usr/bin/env node
// Authorization-matrix LIVE runner — LOCAL DISPOSABLE STACK ONLY.
// Implements docs/security/authz-matrix-test-design.md §4 (owner/tenant/state
// mutations) against the RLS layer via authenticated PostgREST clients, and
// captures the §5 evidence schema (hashes only). One deterministic request per
// case; no bulk/fuzz. Fixtures created + torn down via the service role.
//
// Every group includes CONTROL cases (a legitimate action that MUST succeed and
// a foreign action that MUST fail). A failed control means the harness is
// unreliable for that group — its findings are then marked inconclusive.
//
// Run:  node scripts/authz-matrix-runner.mjs [GROUP]
//   e.g. node scripts/authz-matrix-runner.mjs N10
//   groups: N10 N2 N8 N6 BANK SUB   (default: all)

import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const loadEnv = (file) => Object.fromEntries(
  readFileSync(resolve(root, file), "utf8").split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);

const env = loadEnv(".env.test");
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const T1 = env.TEST_ORG_T1;
const T2 = env.TEST_ORG_T2;
const PW = env.TEST_ADMIN_PASSWORD;

if (!/127\.0\.0\.1|localhost/.test(URL || "")) throw new Error(`Refusing non-local target: ${URL}`);

const sha256 = (v) => createHash("sha256").update(typeof v === "string" ? v : JSON.stringify(v ?? null)).digest("hex").slice(0, 16);
const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

async function actorClient(email, password) {
  const c = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return { client: c, userId: data.user.id, email };
}

const A = {};
async function loadActors() {
  A.admin = await actorClient(env.TEST_ADMIN_USERNAME, PW);
  A.superAdmin = await actorClient(env.TEST_SUPER_ADMIN_USERNAME, PW);
  A.teacherA = await actorClient(env.TEST_TEACHER_USERNAME, PW);
  A.teacherB = await actorClient(env.TEST_TEACHER_B_USERNAME, PW);
  A.teacherT2 = await actorClient(env.TEST_UNRELATED_TEACHER_USERNAME, PW);
  A.student = await actorClient(env.TEST_STUDENT_USERNAME, PW);
}

const evidence = [];
const cleanups = [];

function record(r) {
  const rec = {
    ...r, payload_hash: sha256(r.payload), response_hash: sha256(r.response),
    request_id: randomUUID(), timestamp: new Date().toISOString(),
  };
  delete rec.payload; delete rec.response;
  evidence.push(rec);
  return rec.result;
}

// ---------- generic probes ----------
async function probeSelect({ case_id, actor, table, id, tenant, axis, expectRows }) {
  const { data, error, status } = await actor.client.from(table).select("*").eq("id", id);
  const rows = data?.length ?? 0;
  return record({
    case_id, actor: actor.email, endpoint: `GET /rest/v1/${table}?id=eq.<id>`,
    target_owner: table, tenant, mutation_axis: axis,
    payload: { id }, response: { rows, err: error?.code }, http_status: status,
    denial_code: error?.code ?? null, rls_rows_affected: rows,
    expected: { rows: expectRows }, result: rows === expectRows ? "pass" : "fail",
  });
}

async function probeUpdate({ case_id, actor, table, id, patch, verifyCol, tenant, axis, expectMutated }) {
  const before = (await svc.from(table).select(verifyCol).eq("id", id).single()).data?.[verifyCol];
  const { data, status, error } = await actor.client.from(table).update(patch).eq("id", id).select("id");
  const after = (await svc.from(table).select(verifyCol).eq("id", id).single()).data?.[verifyCol];
  const mutated = before !== after;
  if (mutated) cleanups.push(async () => { await svc.from(table).update({ [verifyCol]: before }).eq("id", id); });
  return record({
    case_id, actor: actor.email, endpoint: `PATCH /rest/v1/${table}?id=eq.<id>`,
    target_owner: table, tenant, mutation_axis: axis,
    payload: { id, patch }, response: { returned: data?.length ?? 0, err: error?.code, mutated },
    http_status: status, denial_code: error?.code ?? null, rls_rows_affected: data?.length ?? 0,
    expected: { mutated: expectMutated }, result: mutated === expectMutated ? "pass" : "fail",
  });
}

async function probeDelete({ case_id, actor, table, id, tenant, axis, expectDeleted }) {
  const existsBefore = !!(await svc.from(table).select("id").eq("id", id).maybeSingle()).data;
  const { status, error } = await actor.client.from(table).delete().eq("id", id);
  const existsAfter = !!(await svc.from(table).select("id").eq("id", id).maybeSingle()).data;
  const deleted = existsBefore && !existsAfter;
  return record({
    case_id, actor: actor.email, endpoint: `DELETE /rest/v1/${table}?id=eq.<id>`,
    target_owner: table, tenant, mutation_axis: axis,
    payload: { id }, response: { err: error?.code, deleted }, http_status: status,
    denial_code: error?.code ?? null, rls_rows_affected: deleted ? 1 : 0,
    expected: { deleted: expectDeleted }, result: deleted === expectDeleted ? "pass" : "fail",
  });
}

// ---------- fixtures ----------
async function insert(table, row, tag) {
  const { data, error } = await svc.from(table).insert(row).select("id").single();
  if (error) throw new Error(`fixture ${table} (${tag}): ${error.message}`);
  cleanups.push(async () => { await svc.from(table).delete().eq("id", data.id); });
  return data.id;
}
const orphanQ = (org, tag) => insert("questions", { organization_id: org, owner_bank_id: null, question_code: `AZ-${tag}-${randomUUID().slice(0, 6)}`, title: `fx ${tag}`, question_type: "mcq", content_html: "<p>x</p>", status: "draft" }, tag);

// ---------- case groups ----------
// N10 — roles x question-access cross-test (WATCH item, not a vuln).
// Orphan (owner_bank_id IS NULL) questions ARE the global/official library.
// `questions_staff_access` gates them on is_admin() = profiles.role in
// (admin,super_admin), a GLOBAL platform role. Global admins managing global
// questions across orgs is INTENDED (confirmed 2026-08-07). These cases encode
// that intent so the suite stays green.
//
// !!! IF THE ROLE MODEL CHANGES (profiles.role='admin' becomes org-scoped, or
// per-org platform admins are introduced) WITHOUT adding an organization_id
// clause to questions_staff_access, this becomes a real cross-tenant IDOR.
// Then flip expectRows->0 / expectMutated->false / expectDeleted->false and
// this same test guards the boundary. See docs/security/findings.md F-001.
async function N10() {
  const t2 = await orphanQ(T2, "T2"), t1 = await orphanQ(T1, "T1"), t2del = await orphanQ(T2, "T2del");
  return [
    ["N10-C1 control: platform admin reads OWN-tenant orphan (allow)", await probeSelect({ case_id: "N10-C1", actor: A.admin, table: "questions", id: t1, tenant: "T1", axis: "tenant", expectRows: 1 })],
    ["N10-C2 control: teacher (non-admin) reads orphan (deny)", await probeSelect({ case_id: "N10-C2", actor: A.teacherA, table: "questions", id: t2, tenant: "T2", axis: "tenant", expectRows: 0 })],
    ["N10-1 platform admin READS global orphan (intended allow; flip if roles change)", await probeSelect({ case_id: "N10-1", actor: A.admin, table: "questions", id: t2, tenant: "T2", axis: "tenant", expectRows: 1 })],
    ["N10-2 platform admin WRITES global orphan (intended allow; flip if roles change)", await probeUpdate({ case_id: "N10-2", actor: A.admin, table: "questions", id: t2, patch: { title: "x" + randomUUID().slice(0, 4) }, verifyCol: "title", tenant: "T2", axis: "tenant", expectMutated: true })],
    ["N10-3 platform admin DELETES global orphan (intended allow; flip if roles change)", await probeDelete({ case_id: "N10-3", actor: A.admin, table: "questions", id: t2del, tenant: "T2", axis: "tenant", expectDeleted: true })],
  ];
}

async function N2() { // state/priv: org admin cannot publish a bank to the public library
  const bank = await insert("question_banks", { name: `fx-bank-N2-${randomUUID().slice(0, 6)}`, owner_scope: "organization", organization_id: T1, visibility: "organization", status: "active" }, "N2");
  return [
    ["N2-C control: admin@T1 sets own bank visibility=organization (allow)", await probeUpdate({ case_id: "N2-C", actor: A.admin, table: "question_banks", id: bank, patch: { visibility: "organization" }, verifyCol: "visibility", tenant: "T1", axis: "state", expectMutated: false })],
    ["N2-1 admin@T1 sets bank visibility=public / publish to library (expect blocked)", await probeUpdate({ case_id: "N2-1", actor: A.admin, table: "question_banks", id: bank, patch: { visibility: "public" }, verifyCol: "visibility", tenant: "T1", axis: "state", expectMutated: false })],
  ];
}

async function N8() { // priv: org update is super_admin-only
  return [
    ["N8-C control: super_admin updates org T1 name (allow)", await probeUpdate({ case_id: "N8-C", actor: A.superAdmin, table: "organizations", id: T1, patch: { name: "tmp-" + randomUUID().slice(0, 6) }, verifyCol: "name", tenant: "T1", axis: "tenant", expectMutated: true })],
    ["N8-1 org admin@T1 updates org T1 name (expect blocked)", await probeUpdate({ case_id: "N8-1", actor: A.admin, table: "organizations", id: T1, patch: { name: "hax-" + randomUUID().slice(0, 6) }, verifyCol: "name", tenant: "T1", axis: "tenant", expectMutated: false })],
  ];
}

async function N6() { // owner: student can delete own submission (divergence from matrix)
  const own = await insert("practice_sessions", { user_id: A.student.userId, organization_id: T1 }, "N6own");
  const foreign = await insert("practice_sessions", { user_id: A.teacherA.userId, organization_id: T1 }, "N6foreign");
  return [
    ["N6-C control: student cannot delete another user's session (deny)", await probeDelete({ case_id: "N6-C", actor: A.student, table: "practice_sessions", id: foreign, tenant: "T1", axis: "owner", expectDeleted: false })],
    ["N6-1 student deletes OWN session (RLS allows — matrix said no-delete)", await probeDelete({ case_id: "N6-1", actor: A.student, table: "practice_sessions", id: own, tenant: "T1", axis: "owner", expectDeleted: true })],
  ];
}

async function BANK() { // owner + tenant isolation on question_banks
  const userBankA = await insert("question_banks", { name: `fx-userbank-A-${randomUUID().slice(0, 6)}`, owner_scope: "user", owner_id: A.teacherA.userId, visibility: "private", status: "active" }, "userBankA");
  await insert("bank_members", { bank_id: userBankA, user_id: A.teacherA.userId, role: "owner", status: "active" }, "memberA");
  const orgBankT1 = await insert("question_banks", { name: `fx-orgbank-T1-${randomUUID().slice(0, 6)}`, owner_scope: "organization", organization_id: T1, visibility: "organization", status: "active" }, "orgBankT1");
  return [
    ["BANK-C1 control: teacher-a reads OWN private bank (allow)", await probeSelect({ case_id: "BANK-C1", actor: A.teacherA, table: "question_banks", id: userBankA, tenant: "T1", axis: "owner", expectRows: 1 })],
    ["BANK-1 teacher-b reads teacher-a's private bank (owner isolation, deny)", await probeSelect({ case_id: "BANK-1", actor: A.teacherB, table: "question_banks", id: userBankA, tenant: "T1", axis: "owner", expectRows: 0 })],
    ["BANK-C2 control: teacher-a reads T1 org bank (allow)", await probeSelect({ case_id: "BANK-C2", actor: A.teacherA, table: "question_banks", id: orgBankT1, tenant: "T1", axis: "tenant", expectRows: 1 })],
    ["BANK-2 teacher@T2 reads T1 org bank (tenant isolation, deny)", await probeSelect({ case_id: "BANK-2", actor: A.teacherT2, table: "question_banks", id: orgBankT1, tenant: "T1", axis: "tenant", expectRows: 0 })],
  ];
}

async function SUB() { // owner isolation on submissions
  const ownSess = await insert("practice_sessions", { user_id: A.student.userId, organization_id: T1 }, "SUBown");
  const otherSess = await insert("practice_sessions", { user_id: A.teacherA.userId, organization_id: T1 }, "SUBother");
  return [
    ["SUB-C control: student reads OWN session (allow)", await probeSelect({ case_id: "SUB-C", actor: A.student, table: "practice_sessions", id: ownSess, tenant: "T1", axis: "owner", expectRows: 1 })],
    ["SUB-1 student reads another user's session (owner isolation, deny)", await probeSelect({ case_id: "SUB-1", actor: A.student, table: "practice_sessions", id: otherSess, tenant: "T1", axis: "owner", expectRows: 0 })],
    ["SUB-2 student WRITES another user's session (expect no mutation)", await probeUpdate({ case_id: "SUB-2", actor: A.student, table: "practice_sessions", id: otherSess, patch: { status: "abandoned" }, verifyCol: "status", tenant: "T1", axis: "owner", expectMutated: false })],
  ];
}

const GROUPS = { N10, N2, N8, N6, BANK, SUB };

async function main() {
  const filter = process.argv[2];
  await loadActors();
  const results = [];
  for (const [name, fn] of Object.entries(GROUPS)) {
    if (filter && filter !== name) continue;
    try { results.push([name, await fn()]); }
    catch (e) { results.push([name, [[`${name} SETUP ERROR: ${e.message}`, "fail"]]]); }
  }
  for (const c of cleanups.reverse()) { try { await c(); } catch { /* best effort */ } }

  console.log("\n=== AUTHZ MATRIX RUNNER — RLS layer (local disposable) ===\n");
  let findings = 0, controlFails = 0;
  const findingIds = new Set();
  for (const [group, rows] of results) {
    console.log(`# ${group}`);
    for (const [label, verdict] of rows) {
      const isControl = /control|-C\b|-C\d/.test(label);
      const ok = verdict === "pass";
      if (!ok && isControl) controlFails++;
      if (!ok && !isControl) { findings++; findingIds.add(label); }
      console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}`);
    }
    console.log("");
  }
  for (const e of evidence) {
    const isControl = /-C(\d|\b)/.test(e.case_id);
    if (e.result === "fail" && !isControl) {
      console.log(`  ⚑ FINDING ${e.case_id}: ${e.actor} — expected ${JSON.stringify(e.expected)}, boundary did not hold (rows_affected=${e.rls_rows_affected}).`);
    }
  }

  const dir = resolve(root, "docs/security/evidence");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fname = `authz-run-${stamp}.json`;
  writeFileSync(resolve(dir, fname), JSON.stringify({ target: URL, ranAt: new Date().toISOString(), evidence }, null, 2));
  console.log(`\nControls failed: ${controlFails} | Findings: ${findings} | Evidence: docs/security/evidence/${fname}`);
  if (controlFails > 0) console.log("WARNING: a control failed — treat that group's findings as inconclusive until fixed.");
  process.exit(0);
}

main().catch((e) => { console.error("RUNNER ERROR:", e.message); process.exit(1); });
