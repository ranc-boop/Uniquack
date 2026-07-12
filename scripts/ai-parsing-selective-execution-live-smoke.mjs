import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: resolve(root, ".env.local"), quiet: true });
dotenv.config({ path: resolve(root, ".env.disposable-smoke.local"), quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(error) {
  return String(error?.message ?? "remote operation failed")
    .replace(/(bearer|api[_ -]?key|token|password)\s*[^\s,;]*/gi, "$1 [redacted]")
    .slice(0, 180);
}

function usernameToEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

async function signIn({ label, password, username }) {
  assert(username && password, `Missing ${label} smoke credentials.`);
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  assert(!error && data.user?.id, `${label} sign-in failed: ${safeError(error)}`);
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id, role, status")
    .eq("id", data.user.id)
    .single();
  assert(!profileError && profile?.status === "active", `${label} profile is not active.`);
  return { client, profile };
}

async function trySignIn(input) {
  if (!input.username || !input.password) return null;
  try {
    return await signIn(input);
  } catch {
    return null;
  }
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

async function assertRlsBlocked(client, controlId, label) {
  const read = await client
    .from("ai_operations_controls")
    .select("id, selective_execution_enabled")
    .is("organization_id", null)
    .is("operation_kind", null);
  assert(
    Boolean(read.error) || !(read.data ?? []).length,
    `${label} can read the admin-only selective execution control`,
  );

  const update = await client
    .from("ai_operations_controls")
    .update({ selective_execution_enabled: false })
    .eq("id", controlId)
    .select("id");
  assert(
    Boolean(update.error) || !(update.data ?? []).length,
    `${label} can modify the admin-only selective execution control`,
  );
}

async function cleanupStaleSmokeJobs(admin) {
  const { data: active, error } = await admin
    .from("ai_provider_jobs")
    .select(
      "id, resource_id, target_bank_id, idempotency_key, execution_attempt_count, max_execution_attempts, lease_expires_at, status",
    )
    .in("status", ["queued", "leased", "processing", "retry_wait"]);
  assert(!error, "Unable to inspect active AI queue metadata.");

  const now = Date.now();
  const rows = Array.isArray(active) ? active : [];
  const staleSmoke = rows.filter((job) => {
    const expiresAt = job.lease_expires_at ? Date.parse(job.lease_expires_at) : NaN;
    return (
      job.status === "processing" &&
      /^queue-e2e-pdf:/.test(String(job.idempotency_key ?? "")) &&
      Number.isFinite(expiresAt) &&
      expiresAt < now
    );
  });

  assert(
    rows.length === staleSmoke.length,
    "Live control validation will not reclaim queue work while unrelated active work exists.",
  );

  let cleaned = 0;
  for (const job of staleSmoke) {
    const { data: batch, error: batchError } = await admin
      .from("import_batches")
      .select("id, summary")
      .eq("id", job.resource_id)
      .maybeSingle();
    assert(!batchError && batch, "Stale smoke job source batch is unavailable.");
    assert(
      record(record(batch.summary).aiPdfImport).smokeOnly === true,
      "Stale job is not the bounded PDF smoke fixture.",
    );

    const { data: assets, error: assetsError } = await admin
      .from("import_batch_assets")
      .select("object_path, metadata")
      .eq("batch_id", job.resource_id)
      .eq("asset_role", "source_pdf");
    assert(
      !assetsError &&
        (assets ?? []).length > 0 &&
        (assets ?? []).every((asset) => record(asset.metadata).smokeOnly === true),
      "Stale job assets are not smoke-only.",
    );
    if (job.target_bank_id) {
      const { data: bank, error: bankError } = await admin
        .from("question_banks")
        .select("description")
        .eq("id", job.target_bank_id)
        .maybeSingle();
      assert(
        !bankError && bank?.description === "Smoke-only durable queue provider validation.",
        "Stale job target Library is not the bounded smoke fixture.",
      );
    }

    const leaseOwner = `selective-stale-cleanup-${randomUUID().slice(0, 8)}`;
    const { data: claimed, error: claimError } = await admin.rpc("claim_ai_provider_jobs", {
      p_lease_owner: leaseOwner,
      p_lease_seconds: 900,
      p_limit: 1,
    });
    assert(!claimError, `Unable to recover stale smoke queue lease: ${safeError(claimError)}`);

    const reclaimed = Array.isArray(claimed) ? claimed[0] : null;
    if (reclaimed?.id === job.id) {
      const { data: finished, error: finishError } = await admin.rpc("finish_ai_provider_job", {
        p_available_at: null,
        p_job_id: job.id,
        p_lease_owner: leaseOwner,
        p_provider_attempt_count: 0,
        p_retryable: false,
        p_safe_error_code: "smoke_stale_lease",
        p_safe_message:
          "The stale smoke validation run was closed without provider execution. Nothing was published or assigned.",
        p_safe_result: { smokeCleanup: true },
        p_status: "failed",
      });
      assert(!finishError && finished === true, `Unable to finish recovered smoke job: ${safeError(finishError)}`);
    } else {
      assert(
        Number(job.execution_attempt_count) >= Number(job.max_execution_attempts),
        "Stale smoke cleanup did not reclaim the expected job.",
      );
    }

    const { data: items } = await admin
      .from("import_batch_items")
      .select("created_question_id")
      .eq("batch_id", job.resource_id);
    const questionIds = (items ?? []).map((item) => item.created_question_id).filter(Boolean);
    const { error: reviewDeleteError } = await admin
      .from("review_batches")
      .delete()
      .eq("source_record_id", job.resource_id);
    assert(!reviewDeleteError, "Unable to clean stale smoke review rows.");
    if (questionIds.length) {
      const { error: assignmentDeleteError } = await admin
        .from("question_taxonomy_assignments")
        .delete()
        .in("question_id", questionIds);
      const { error: questionDeleteError } = await admin.from("questions").delete().in("id", questionIds);
      assert(!assignmentDeleteError && !questionDeleteError, "Unable to clean stale smoke question rows.");
    }
    const { error: logDeleteError } = await admin
      .from("ai_provider_operation_logs")
      .delete()
      .eq("related_record_id", job.resource_id);
    const { error: batchDeleteError } = await admin.from("import_batches").delete().eq("id", job.resource_id);
    assert(!logDeleteError && !batchDeleteError, "Unable to clean stale smoke import rows.");
    const objectPaths = (assets ?? []).map((asset) => asset.object_path).filter(Boolean);
    if (objectPaths.length) {
      const { error: storageDeleteError } = await admin.storage.from("ai-import-sources").remove(objectPaths);
      assert(!storageDeleteError, "Unable to clean stale smoke source files.");
    }
    const { error: jobDeleteError } = await admin.from("ai_provider_jobs").delete().eq("id", job.id);
    assert(!jobDeleteError, "Unable to clean stale smoke queue row.");
    if (job.target_bank_id) {
      const { error: bankDeleteError } = await admin.from("question_banks").delete().eq("id", job.target_bank_id);
      assert(!bankDeleteError, "Unable to clean stale smoke Library.");
    }
    cleaned += 1;
  }

  return { activeCount: rows.length, cleaned };
}

async function readWorkerControl(admin) {
  const { data, error } = await admin.rpc("get_ai_operations_worker_control");
  assert(!error, `Trusted worker control read failed: ${safeError(error)}`);
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? {};
}

async function main() {
  assert(url && anonKey && serviceRoleKey, "Missing clean Supabase smoke configuration.");
  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [teacher, student, unrelatedTeacher] = await Promise.all([
    signIn({
      label: "teacher",
      password: process.env.TEST_TEACHER_PASSWORD,
      username: process.env.TEST_TEACHER_USERNAME,
    }),
    signIn({
      label: "student",
      password: process.env.TEST_STUDENT_PASSWORD,
      username: process.env.TEST_STUDENT_USERNAME,
    }),
    signIn({
      label: "unrelated teacher",
      password: process.env.TEST_UNRELATED_TEACHER_PASSWORD,
      username: process.env.TEST_UNRELATED_TEACHER_USERNAME,
    }),
  ]);
  const superAdmin =
    (await trySignIn({
      label: "super admin",
      password: process.env.TEST_SUPER_ADMIN_PASSWORD,
      username: process.env.TEST_SUPER_ADMIN_USERNAME,
    })) ??
    (await signIn({
      label: "admin fallback",
      password: process.env.TEST_ADMIN_PASSWORD,
      username: process.env.TEST_ADMIN_USERNAME,
    }));
  assert(superAdmin.profile.role === "super_admin", "A real super-admin smoke account is required.");

  const cleanup = await cleanupStaleSmokeJobs(admin);
  const { data: control, error: controlError } = await admin
    .from("ai_operations_controls")
    .select("id, selective_execution_enabled")
    .is("organization_id", null)
    .is("operation_kind", null)
    .maybeSingle();
  assert(!controlError && control?.id, "0037 selective execution control row is unavailable.");
  assert(control.selective_execution_enabled === false, "Selective execution must begin disabled.");

  try {
    await Promise.all([
      assertRlsBlocked(teacher.client, control.id, "teacher"),
      assertRlsBlocked(student.client, control.id, "student"),
      assertRlsBlocked(unrelatedTeacher.client, control.id, "unrelated teacher"),
    ]);
    console.log("PASS selective control RLS blocks teacher, student, and unrelated-teacher reads/writes");

    const { data: enabled, error: enableError } = await superAdmin.client
      .from("ai_operations_controls")
      .update({ selective_execution_enabled: true })
      .eq("id", control.id)
      .select("selective_execution_enabled")
      .single();
    assert(!enableError && enabled?.selective_execution_enabled === true, "Super admin could not enable the control.");

    const workerEnabled = await readWorkerControl(admin);
    assert(workerEnabled.selective_execution_enabled === true, "Trusted worker did not resolve enabled selective execution.");
    const [service, teacherActions, worker] = await Promise.all([
      readFile(resolve(root, "src/lib/ai-pdf-import/service.ts"), "utf8"),
      readFile(resolve(root, "src/app/teacher/banks/actions.ts"), "utf8"),
      readFile(resolve(root, "src/lib/ai-jobs/worker.ts"), "utf8"),
    ]);
    assert(
      service.includes("input.selectiveExecutionEnabled !== true") &&
        worker.includes("selectiveExecutionEnabled: control.selectiveExecutionEnabled") &&
        !teacherActions.includes("selectiveExecutionEnabled"),
      "Selective mode is not restricted to the explicit trusted-worker opt-in path.",
    );
    console.log("PASS super-admin enable resolves only through the trusted worker opt-in path");
  } finally {
    const { error: disableError } = await admin
      .from("ai_operations_controls")
      .update({ selective_execution_enabled: false })
      .eq("id", control.id);
    if (disableError) throw new Error(`Unable to restore selective control: ${safeError(disableError)}`);
  }

  const workerDisabled = await readWorkerControl(admin);
  assert(workerDisabled.selective_execution_enabled === false, "Selective execution was not restored to false.");
  console.log(`PASS 0037 remote control defaults false, toggles safely, and is restored false (stale smoke jobs cleaned: ${cleanup.cleaned}/${cleanup.activeCount})`);
}

await main();
