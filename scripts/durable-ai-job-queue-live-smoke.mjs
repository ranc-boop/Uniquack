import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: resolve(root, ".env.disposable-smoke.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey =
  process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const teacherUsername = process.env.TEST_TEACHER_USERNAME;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;
const unrelatedTeacherUsername = process.env.TEST_UNRELATED_TEACHER_USERNAME;
const unrelatedTeacherPassword = process.env.TEST_UNRELATED_TEACHER_PASSWORD;
const adminUsername = process.env.TEST_ADMIN_USERNAME;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
const superAdminUsername = process.env.TEST_SUPER_ADMIN_USERNAME;
const superAdminPassword = process.env.TEST_SUPER_ADMIN_PASSWORD;
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function summarizeSupabaseError(error) {
  if (!error) return "unknown error";
  return [error.message, error.code, error.details, error.hint]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 500);
}

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

function jobFromRpc(data) {
  return Array.isArray(data) ? data[0] : data;
}

async function signIn(username, password, label) {
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });

  if (error) throw new Error(`${label} sign-in failed: ${error.message}`);
  assert(data.user?.id, `${label} sign-in did not return a user`);
  return { client, user: data.user };
}

async function trySignIn(username, password, label) {
  if (!username || !password) return null;
  try {
    return await signIn(username, password, label);
  } catch {
    return null;
  }
}

async function createSmokeBatch({ bankId, organizationId, profileId, suffix, teacher }) {
  const batchId = randomUUID();
  const { error } = await teacher.client.from("import_batches").insert({
    created_by: profileId,
    id: batchId,
    organization_id: organizationId,
    source_type: "ai_pdf",
    status: "draft",
    summary: {
      aiPdfImport: { smokeOnly: true, targetBankId: bankId },
      smokeOnly: true,
    },
    target_bank_id: bankId,
  });
  assert(!error, `smoke import batch create failed: ${summarizeSupabaseError(error)}`);
  return { batchId, suffix };
}

async function enqueueSmokeJob({ bankId, batchId, key, teacher }) {
  const { data, error } = await teacher.client.rpc("enqueue_ai_provider_job", {
    p_idempotency_key: key,
    p_job_kind: "ai_pdf_extract",
    p_payload: { smokeOnly: true },
    p_provider_profile_id: null,
    p_resource_id: batchId,
    p_resource_type: "import_batch",
    p_target_bank_id: bankId,
  });
  assert(!error, `queue enqueue failed: ${summarizeSupabaseError(error)}`);
  const job = jobFromRpc(data);
  assert(job?.id, "queue enqueue did not return a durable job");
  return job;
}

async function removeSmokeRows({ admin, bankId, batchIds, jobIds, organizationIds }) {
  if (jobIds.length) {
    await admin.from("ai_provider_jobs").delete().in("id", jobIds);
  }
  if (batchIds.length) {
    await admin.from("import_batches").delete().in("id", batchIds);
  }
  if (bankId) {
    await admin.from("question_banks").delete().eq("id", bankId);
  }
  if (organizationIds.length) {
    await admin.from("organizations").delete().in("id", organizationIds);
  }
}

async function main() {
  assert(supabaseUrl && supabaseAnonKey, "Missing clean Supabase URL or anon key.");
  assert(serviceRoleKey, "Missing clean service-role key for live queue cleanup.");
  assert(teacherUsername && teacherPassword, "Missing TEST_TEACHER credentials for live queue smoke.");

  const [migration, roleFixMigration, teacher] = await Promise.all([
    readFile(resolve(root, "supabase/clean-migrations/0033_ai_provider_jobs.sql"), "utf8"),
    readFile(resolve(root, "supabase/clean-migrations/0034_ai_provider_jobs_worker_role_fix.sql"), "utf8"),
    signIn(teacherUsername, teacherPassword, "teacher"),
  ]);
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await teacher.client
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", teacher.user.id)
    .single();
  assert(!profileError, `teacher profile read failed: ${summarizeSupabaseError(profileError)}`);
  assert(profile.role === "teacher" && profile.status === "active", "live queue smoke requires an active teacher");
  assert(profile.default_organization_id, "teacher needs a default organization");

  const { error: queueProbeError } = await admin
    .from("ai_provider_jobs")
    .select("id")
    .limit(1);
  assert(!queueProbeError, `ai_provider_jobs probe failed: ${summarizeSupabaseError(queueProbeError)}`);
  assert(
    migration.includes("unique (job_kind, resource_type, resource_id, idempotency_key)") &&
      migration.includes("for update of job skip locked") &&
      migration.includes("enable row level security") &&
      migration.includes("claim_ai_provider_jobs") &&
      migration.includes("heartbeat_ai_provider_job") &&
      migration.includes("finish_ai_provider_job") &&
      migration.includes("cancel_ai_provider_job"),
    "queue migration source is missing required live queue constraints, RLS, or RPCs",
  );
  assert(
    roleFixMigration.includes("nullif(auth.role()::text, '')") &&
      roleFixMigration.includes("create or replace function public.claim_ai_provider_jobs") &&
      roleFixMigration.includes("create or replace function public.heartbeat_ai_provider_job") &&
      roleFixMigration.includes("create or replace function public.finish_ai_provider_job"),
    "queue worker role fix must use auth.role() for service-role requests",
  );
  console.log("PASS live queue schema probe found table and required migration contract");

  const { data: existingOutstanding, error: existingOutstandingError } = await admin
    .from("ai_provider_jobs")
    .select("id")
    .in("status", ["queued", "leased", "processing", "retry_wait"]);
  assert(
    !existingOutstandingError,
    `existing queue safety check failed: ${summarizeSupabaseError(existingOutstandingError)}`,
  );
  assert(
    !(existingOutstanding ?? []).length,
    "live queue smoke will not claim while pre-existing queue work exists",
  );

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let bankId = null;
  const batchIds = [];
  const jobIds = [];
  const organizationIds = [];

  try {
    const { data: createdBankId, error: bankError } = await teacher.client.rpc(
      "create_question_bank",
      {
        bank_description: "Smoke-only durable AI queue validation.",
        bank_name: `AI queue live smoke ${suffix}`,
        bank_visibility: "private",
      },
    );
    assert(!bankError && createdBankId, `smoke bank create failed: ${summarizeSupabaseError(bankError)}`);
    bankId = createdBankId;

    const primaryBatch = await createSmokeBatch({
      bankId,
      organizationId: profile.default_organization_id,
      profileId: profile.id,
      suffix,
      teacher,
    });
    batchIds.push(primaryBatch.batchId);
    const idempotencyKey = `queue-live-smoke:${primaryBatch.batchId}:retry:0`;
    const firstJob = await enqueueSmokeJob({
      bankId,
      batchId: primaryBatch.batchId,
      key: idempotencyKey,
      teacher,
    });
    jobIds.push(firstJob.id);
    const duplicateJob = await enqueueSmokeJob({
      bankId,
      batchId: primaryBatch.batchId,
      key: idempotencyKey,
      teacher,
    });
    assert(firstJob.id === duplicateJob.id, "duplicate enqueue did not reuse the existing durable job");
    console.log("PASS duplicate enqueue reuses one durable job");

    const { data: directUpdate, error: directUpdateError } = await teacher.client
      .from("ai_provider_jobs")
      .update({ status: "completed" })
      .eq("id", firstJob.id)
      .select("id");
    assert(
      Boolean(directUpdateError) || !(directUpdate ?? []).length,
      "normal teacher client unexpectedly mutated a worker queue row",
    );
    const { data: afterDirectUpdate, error: afterDirectUpdateError } = await admin
      .from("ai_provider_jobs")
      .select("status")
      .eq("id", firstJob.id)
      .single();
    assert(
      !afterDirectUpdateError && afterDirectUpdate.status === "queued",
      "direct teacher mutation changed the durable job status",
    );

    const { data: teacherClaim, error: teacherClaimError } = await teacher.client.rpc(
      "claim_ai_provider_jobs",
      { p_lease_owner: "teacher-client-smoke", p_lease_seconds: 900, p_limit: 1 },
    );
    assert(
      Boolean(teacherClaimError) || !(teacherClaim ?? []).length,
      "normal teacher client unexpectedly claimed a worker job",
    );
    console.log("PASS normal teacher cannot mutate or claim worker fields");

    if (studentUsername && studentPassword) {
      const student = await signIn(studentUsername, studentPassword, "student");
      const { data: studentJobs, error: studentJobsError } = await student.client
        .from("ai_provider_jobs")
        .select("id")
        .eq("id", firstJob.id);
      assert(!studentJobsError && !(studentJobs ?? []).length, "student read a teacher queue job");
      console.log("PASS student cannot read teacher queue jobs");
    } else {
      console.log("SKIP student queue RLS check: TEST_STUDENT credentials are missing.");
    }

    if (unrelatedTeacherUsername && unrelatedTeacherPassword) {
      const unrelatedTeacher = await signIn(
        unrelatedTeacherUsername,
        unrelatedTeacherPassword,
        "unrelated teacher",
      );
      const { data: unrelatedJobs, error: unrelatedJobsError } = await unrelatedTeacher.client
        .from("ai_provider_jobs")
        .select("id")
        .eq("id", firstJob.id);
      assert(
        !unrelatedJobsError && !(unrelatedJobs ?? []).length,
        "unrelated teacher read another teacher's private queue job",
      );
      console.log("PASS unrelated teacher cannot read private queue jobs");
    } else {
      console.log("SKIP unrelated teacher queue RLS check: credentials are missing.");
    }

    const [claimA, claimB] = await Promise.all([
      admin.rpc("claim_ai_provider_jobs", {
        p_lease_owner: "queue-live-worker-a",
        p_lease_seconds: 900,
        p_limit: 1,
      }),
      admin.rpc("claim_ai_provider_jobs", {
        p_lease_owner: "queue-live-worker-b",
        p_lease_seconds: 900,
        p_limit: 1,
      }),
    ]);
    assert(!claimA.error && !claimB.error, `atomic claim failed: ${summarizeSupabaseError(claimA.error ?? claimB.error)}`);
    const claimed = [...(claimA.data ?? []), ...(claimB.data ?? [])];
    assert(claimed.length === 1 && claimed[0].id === firstJob.id, "two workers did not atomically claim exactly one smoke job");
    const leaseOwner = claimed[0].lease_owner;
    assert(leaseOwner === "queue-live-worker-a" || leaseOwner === "queue-live-worker-b", "claim did not set a trusted lease owner");
    console.log("PASS concurrent workers atomically claim one job with SKIP LOCKED");

    const { data: heartbeat, error: heartbeatError } = await admin.rpc("heartbeat_ai_provider_job", {
      p_job_id: firstJob.id,
      p_lease_owner: leaseOwner,
      p_lease_seconds: 900,
    });
    assert(!heartbeatError && heartbeat === true, `lease heartbeat failed: ${summarizeSupabaseError(heartbeatError)}`);

    const { error: expireLeaseError } = await admin
      .from("ai_provider_jobs")
      .update({ lease_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", firstJob.id);
    assert(!expireLeaseError, `could not create stale lease fixture: ${summarizeSupabaseError(expireLeaseError)}`);

    const { data: reclaimed, error: reclaimError } = await admin.rpc("claim_ai_provider_jobs", {
      p_lease_owner: "queue-live-worker-reclaimed",
      p_lease_seconds: 900,
      p_limit: 1,
    });
    assert(
      !reclaimError && reclaimed?.length === 1 && reclaimed[0].id === firstJob.id,
      `stale lease recovery failed: ${summarizeSupabaseError(reclaimError)}`,
    );
    const { data: staleFinish, error: staleFinishError } = await admin.rpc("finish_ai_provider_job", {
      p_available_at: null,
      p_job_id: firstJob.id,
      p_lease_owner: leaseOwner,
      p_provider_attempt_count: 0,
      p_retryable: false,
      p_safe_error_code: null,
      p_safe_message: null,
      p_safe_result: {},
      p_status: "completed",
    });
    assert(!staleFinishError && staleFinish === false, "old lease owner completed a reclaimed job");
    console.log("PASS heartbeat, stale lease recovery, and stale-owner guard");

    const retryAt = new Date(Date.now() + 60_000).toISOString();
    const { data: retryFinished, error: retryFinishError } = await admin.rpc("finish_ai_provider_job", {
      p_available_at: retryAt,
      p_job_id: firstJob.id,
      p_lease_owner: "queue-live-worker-reclaimed",
      p_provider_attempt_count: 1,
      p_retryable: true,
      p_safe_error_code: "provider_temporarily_busy",
      p_safe_message: "The AI service is temporarily busy. Your work is safe and will retry automatically.",
      p_safe_result: {},
      p_status: "retry_wait",
    });
    assert(!retryFinishError && retryFinished === true, `retry_wait finish failed: ${summarizeSupabaseError(retryFinishError)}`);
    const { data: retryJob, error: retryReadError } = await admin
      .from("ai_provider_jobs")
      .select("status, available_at, safe_message, safe_error_code")
      .eq("id", firstJob.id)
      .single();
    assert(
      !retryReadError && retryJob.status === "retry_wait" && new Date(retryJob.available_at) > new Date(),
      "retry_wait did not preserve a future availability time",
    );
    const safeText = `${retryJob.safe_message ?? ""} ${retryJob.safe_error_code ?? ""}`.toLowerCase();
    assert(!safeText.includes("503") && !safeText.includes("api key") && !safeText.includes("token"), "queue stored raw provider failure data");

    const { data: cancelled, error: cancelError } = await teacher.client.rpc("cancel_ai_provider_job", {
      p_job_id: firstJob.id,
    });
    assert(!cancelError && cancelled === true, `queued retry cancellation failed: ${summarizeSupabaseError(cancelError)}`);
    console.log("PASS retry_wait preserves safe state and teacher can cancel it");

    const permanentBatch = await createSmokeBatch({
      bankId,
      organizationId: profile.default_organization_id,
      profileId: profile.id,
      suffix,
      teacher,
    });
    batchIds.push(permanentBatch.batchId);
    const permanentJob = await enqueueSmokeJob({
      bankId,
      batchId: permanentBatch.batchId,
      key: `queue-live-permanent:${permanentBatch.batchId}`,
      teacher,
    });
    jobIds.push(permanentJob.id);
    const { data: permanentClaim, error: permanentClaimError } = await admin.rpc("claim_ai_provider_jobs", {
      p_lease_owner: "queue-live-worker-permanent",
      p_lease_seconds: 900,
      p_limit: 1,
    });
    assert(
      !permanentClaimError && permanentClaim?.[0]?.id === permanentJob.id,
      `permanent failure claim failed: ${summarizeSupabaseError(permanentClaimError)}`,
    );
    const { data: permanentFinish, error: permanentFinishError } = await admin.rpc("finish_ai_provider_job", {
      p_available_at: null,
      p_job_id: permanentJob.id,
      p_lease_owner: "queue-live-worker-permanent",
      p_provider_attempt_count: 1,
      p_retryable: false,
      p_safe_error_code: "invalid_input",
      p_safe_message: "This run could not be completed. Nothing was published or assigned.",
      p_safe_result: {},
      p_status: "failed",
    });
    assert(!permanentFinishError && permanentFinish === true, `permanent failure finish failed: ${summarizeSupabaseError(permanentFinishError)}`);
    const { data: permanentState, error: permanentStateError } = await admin
      .from("ai_provider_jobs")
      .select("status, retryable, available_at")
      .eq("id", permanentJob.id)
      .single();
    assert(
      !permanentStateError && permanentState.status === "failed" && permanentState.retryable === false,
      "permanent queue failure unexpectedly scheduled a retry",
    );
    console.log("PASS permanent failure remains failed without retry");

    const schedulerOrganizations = [];
    for (let index = 0; index < 3; index += 1) {
      const { data: organization, error: organizationError } = await admin
        .from("organizations")
        .insert({
          name: `AI queue scheduler smoke ${suffix} ${index + 1}`,
          slug: `ai-queue-scheduler-smoke-${suffix}-${index + 1}`,
        })
        .select("id")
        .single();
      assert(
        !organizationError && organization?.id,
        `scheduler organization create failed: ${summarizeSupabaseError(organizationError)}`,
      );
      schedulerOrganizations.push(organization.id);
      organizationIds.push(organization.id);
    }

    const schedulerRows = schedulerOrganizations.map((organizationId, index) => ({
      created_by: profile.id,
      fairness_key: `${organizationId}:${profile.id}:scheduler`,
      idempotency_key: `queue-live-scheduler:${suffix}:${index + 1}`,
      job_kind: index === 0 ? "ai_pdf_extract" : "blueprint_generate_questions",
      organization_id: organizationId,
      payload: { smokeOnly: true, schedulerFixture: true },
      resource_id: randomUUID(),
      resource_type: index === 0 ? "import_batch" : "question_blueprint",
      status: "queued",
    }));
    const { data: schedulerJobs, error: schedulerJobsError } = await admin
      .from("ai_provider_jobs")
      .insert(schedulerRows)
      .select("id, organization_id, job_kind, lease_owner");
    assert(
      !schedulerJobsError && schedulerJobs?.length === 3,
      `scheduler fixture create failed: ${summarizeSupabaseError(schedulerJobsError)}`,
    );
    jobIds.push(...schedulerJobs.map((job) => job.id));
    const { data: schedulerClaims, error: schedulerClaimError } = await admin.rpc(
      "claim_ai_provider_jobs",
      {
        p_lease_owner: "queue-live-worker-capacity",
        p_lease_seconds: 900,
        p_limit: 3,
      },
    );
    assert(
      !schedulerClaimError && schedulerClaims?.length === 3,
      `capacity claim failed: ${summarizeSupabaseError(schedulerClaimError)}`,
    );
    assert(
      new Set(schedulerClaims.map((job) => job.organization_id)).size === 3,
      "per-organization active limit did not keep scheduler work fair",
    );
    assert(
      schedulerClaims.filter((job) => job.job_kind === "ai_pdf_extract").length === 1 &&
        schedulerClaims.filter((job) => job.job_kind === "blueprint_generate_questions").length === 2,
      "global/per-kind active queue limits were not preserved",
    );
    for (const schedulerJob of schedulerClaims) {
      const { data: finished, error: finishError } = await admin.rpc("finish_ai_provider_job", {
        p_available_at: null,
        p_job_id: schedulerJob.id,
        p_lease_owner: "queue-live-worker-capacity",
        p_provider_attempt_count: 0,
        p_retryable: false,
        p_safe_error_code: null,
        p_safe_message: null,
        p_safe_result: { smokeOnly: true },
        p_status: "completed",
      });
      assert(!finishError && finished === true, `scheduler fixture finish failed: ${summarizeSupabaseError(finishError)}`);
    }
    console.log("PASS global, per-kind, per-organization, and fairness limits hold live");

    if (unrelatedTeacherUsername && unrelatedTeacherPassword) {
      const unrelatedTeacher = await signIn(
        unrelatedTeacherUsername,
        unrelatedTeacherPassword,
        "unrelated teacher",
      );
      const capacityStaff =
        (await trySignIn(superAdminUsername, superAdminPassword, "super admin")) ??
        (await trySignIn(adminUsername, adminPassword, "admin"));
      if (!capacityStaff) {
        console.log("SKIP organization queue-capacity live check: no valid third staff smoke credential is available.");
        return;
      }
      const { error: membershipError } = await admin.from("bank_members").upsert(
        [
          {
            bank_id: bankId,
            role: "editor",
            status: "active",
            user_id: unrelatedTeacher.user.id,
          },
          {
            bank_id: bankId,
            role: "editor",
            status: "active",
            user_id: capacityStaff.user.id,
          },
        ],
        { onConflict: "bank_id,user_id" },
      );
      assert(!membershipError, `temporary editor membership failed: ${summarizeSupabaseError(membershipError)}`);

      const actors = [
        { label: "teacher", actor: teacher, count: 5 },
        { label: "unrelated-teacher", actor: unrelatedTeacher, count: 5 },
        { label: "capacity-staff", actor: capacityStaff, count: 2 },
      ];
      const outstanding = [];
      for (const entry of actors) {
        for (let index = 0; index < entry.count; index += 1) {
          const batch = await createSmokeBatch({
            bankId,
            organizationId: profile.default_organization_id,
            profileId: entry.actor.user.id,
            suffix,
            teacher: { client: admin, user: entry.actor.user },
          });
          batchIds.push(batch.batchId);
          const job = await enqueueSmokeJob({
            bankId,
            batchId: batch.batchId,
            key: `queue-live-${entry.label}:${batch.batchId}`,
            teacher: entry.actor,
          });
          jobIds.push(job.id);
          outstanding.push({ actor: entry.actor, id: job.id });
        }
      }

      const userLimitBatch = await createSmokeBatch({
        bankId,
        organizationId: profile.default_organization_id,
        profileId: teacher.user.id,
        suffix,
        teacher: { client: admin, user: teacher.user },
      });
      batchIds.push(userLimitBatch.batchId);
      const { error: userLimitError } = await teacher.client.rpc("enqueue_ai_provider_job", {
        p_idempotency_key: `queue-live-user-overflow:${userLimitBatch.batchId}`,
        p_job_kind: "ai_pdf_extract",
        p_payload: { smokeOnly: true },
        p_provider_profile_id: null,
        p_resource_id: userLimitBatch.batchId,
        p_resource_type: "import_batch",
        p_target_bank_id: bankId,
      });
      assert(Boolean(userLimitError), "per-user queue limit did not block a sixth queued job");

      const organizationLimitBatch = await createSmokeBatch({
        bankId,
        organizationId: profile.default_organization_id,
        profileId: capacityStaff.user.id,
        suffix,
        teacher: { client: admin, user: capacityStaff.user },
      });
      batchIds.push(organizationLimitBatch.batchId);
      const { error: organizationLimitError } = await capacityStaff.client.rpc("enqueue_ai_provider_job", {
        p_idempotency_key: `queue-live-organization-overflow:${organizationLimitBatch.batchId}`,
        p_job_kind: "ai_pdf_extract",
        p_payload: { smokeOnly: true },
        p_provider_profile_id: null,
        p_resource_id: organizationLimitBatch.batchId,
        p_resource_type: "import_batch",
        p_target_bank_id: bankId,
      });
      assert(Boolean(organizationLimitError), "per-organization queue limit did not block a thirteenth queued job");

      for (const queued of outstanding) {
        const { data: cancelled, error: cancellationError } = await queued.actor.client.rpc(
          "cancel_ai_provider_job",
          { p_job_id: queued.id },
        );
        assert(
          !cancellationError && cancelled === true,
          `outstanding smoke job cleanup cancellation failed: ${summarizeSupabaseError(cancellationError)}`,
        );
      }
      console.log("PASS per-user and per-organization queue limits hold live");
    } else {
      console.log("SKIP user/organization queue-capacity live checks: unrelated teacher credentials are missing.");
    }
  } finally {
    await removeSmokeRows({ admin, bankId, batchIds, jobIds, organizationIds });
    console.log("PASS durable AI job queue live smoke cleanup removed smoke-only rows");
  }
}

await main();
