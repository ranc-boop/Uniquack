#!/usr/bin/env node

import { randomBytes, randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const DISPOSABLE_CONFIRMATION = "DISPOSABLE_CLASSROOM_ROLE_E2E";
const CLEANUP_CONFIRMATION = "DELETE_CLASSROOM_ROLE_E2E_FIXTURES";
const REQUIRED_ENVIRONMENT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "CLASSROOM_LIVE_E2E_ENVIRONMENT",
  "CLASSROOM_LIVE_E2E_EXPECTED_PROJECT_REF",
  "CLASSROOM_LIVE_E2E_CONFIRM_CLEANUP",
];

class HarnessError extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

function assert(condition, category) {
  if (!condition) throw new HarnessError(category);
}

function safeErrorCategory(error) {
  const raw = String(error?.code ?? error?.status ?? "request_failed");
  return /^[A-Za-z0-9_:-]{1,80}$/.test(raw) ? raw : "request_failed";
}

function assertNoError(result, category) {
  if (result?.error) {
    throw new HarnessError(`${category}:${safeErrorCategory(result.error)}`);
  }
  return result?.data;
}

function projectRefFromSupabaseUrl(value) {
  try {
    const url = new URL(value);
    const match = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
    return match?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function requireApprovedProcessEnvironment() {
  const missing = REQUIRED_ENVIRONMENT.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new HarnessError(`missing_process_environment:${missing.join(",")}`);
  }

  if (process.env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new HarnessError("production_environment_refused");
  }

  if (process.env.CLASSROOM_LIVE_E2E_ENVIRONMENT !== DISPOSABLE_CONFIRMATION) {
    throw new HarnessError("disposable_environment_acknowledgement_required");
  }

  if (process.env.CLASSROOM_LIVE_E2E_CONFIRM_CLEANUP !== CLEANUP_CONFIRMATION) {
    throw new HarnessError("destructive_fixture_acknowledgement_required");
  }

  const actualProjectRef = projectRefFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const expectedProjectRef = process.env.CLASSROOM_LIVE_E2E_EXPECTED_PROJECT_REF.trim().toLowerCase();
  if (!actualProjectRef || actualProjectRef !== expectedProjectRef) {
    throw new HarnessError("expected_project_identity_mismatch");
  }

  return {
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
}

function makeOpaqueRunId() {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

function randomPassword() {
  return `ClassroomE2E!${randomBytes(24).toString("base64url")}`;
}

function createSessionClient(url, anonKey) {
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function signInFixture({ anonKey, email, password, url }) {
  const client = createSessionClient(url, anonKey);
  const result = await client.auth.signInWithPassword({ email, password });
  assert(!result.error && result.data.user?.id, "fixture_sign_in_failed");
  return { client, id: result.data.user.id };
}

async function createOrganization(service, fixtures, runId, kind) {
  const result = await service
    .from("organizations")
    .insert({
      name: `Classroom role E2E ${kind} ${runId}`,
      slug: `classroom-role-e2e-${kind}-${runId}`,
      status: "active",
    })
    .select("id")
    .single();
  const row = assertNoError(result, "fixture_organization_create_failed");
  assert(row?.id, "fixture_organization_id_missing");
  fixtures.organizationIds.push(row.id);
  return row.id;
}

async function createRoleFixture({
  anonKey,
  fixtures,
  organizationId,
  profileStatus,
  role,
  runId,
  service,
  url,
}) {
  const label = `${role}-${profileStatus}-${fixtures.userIds.length + 1}`;
  const email = `classroom-role-e2e-${runId}-${label}@fixture.invalid`;
  const password = randomPassword();
  const authResult = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: {
      fixture_kind: "classroom_live_role_e2e",
      fixture_run: runId,
    },
  });
  assert(!authResult.error && authResult.data.user?.id, "fixture_auth_user_create_failed");
  const userId = authResult.data.user.id;
  fixtures.userIds.push(userId);

  const profileResult = await service.from("profiles").upsert(
    {
      default_organization_id: organizationId,
      display_name: `Classroom role E2E ${label}`,
      email,
      id: userId,
      role,
      status: profileStatus,
      username: `classroom-role-e2e-${runId}-${label}`,
    },
    { onConflict: "id" },
  );
  assertNoError(profileResult, "fixture_profile_create_failed");

  const memberResult = await service
    .from("organization_members")
    .insert({
      organization_id: organizationId,
      role,
      status: profileStatus === "active" ? "active" : "disabled",
      user_id: userId,
    })
    .select("id")
    .single();
  const membership = assertNoError(memberResult, "fixture_organization_member_create_failed");
  assert(membership?.id, "fixture_organization_member_id_missing");
  fixtures.organizationMemberIds.push(membership.id);

  const session = await signInFixture({ anonKey, email, password, url });
  assert(session.id === userId, "fixture_session_identity_mismatch");
  return { client: session.client, id: userId };
}

async function countRows(query, category) {
  const { count, error } = await query;
  if (error) throw new HarnessError(`${category}:${safeErrorCategory(error)}`);
  return count ?? 0;
}

async function snapshotNonClassroomEffects(service, fixtures) {
  const userIds = fixtures.userIds;
  const organizationId = fixtures.primaryOrganizationId;
  const studentId = fixtures.student?.id;

  return {
    assignmentPracticeSessions: await countRows(
      service
        .from("assignment_practice_sessions")
        .select("assignment_id", { count: "exact", head: true })
        .eq("student_id", studentId),
      "assignment_practice_session_snapshot_failed",
    ),
    assignments: await countRows(
      service
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      "assignment_snapshot_failed",
    ),
    bankMembers: await countRows(
      service
        .from("bank_members")
        .select("id", { count: "exact", head: true })
        .in("user_id", userIds),
      "bank_membership_snapshot_failed",
    ),
    blueprints: await countRows(
      service
        .from("question_blueprints")
        .select("id", { count: "exact", head: true })
        .in("owner_id", userIds),
      "blueprint_snapshot_failed",
    ),
    imports: await countRows(
      service
        .from("import_batches")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      "import_snapshot_failed",
    ),
    practiceSessions: await countRows(
      service
        .from("practice_sessions")
        .select("id", { count: "exact", head: true })
        .in("user_id", userIds),
      "practice_session_snapshot_failed",
    ),
    progress: await countRows(
      service
        .from("student_assignment_progress")
        .select("id", { count: "exact", head: true })
        .eq("student_id", studentId),
      "student_progress_snapshot_failed",
    ),
    publishedQuestions: await countRows(
      service
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .not("published_at", "is", null),
      "publication_snapshot_failed",
    ),
    questions: await countRows(
      service
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      "question_snapshot_failed",
    ),
    questionAssets: await countRows(
      service
        .from("question_assets")
        .select("id", { count: "exact", head: true })
        .in("created_by", userIds),
      "question_asset_snapshot_failed",
    ),
    reviewBatches: await countRows(
      service
        .from("review_batches")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId),
      "review_snapshot_failed",
    ),
    sourceFiles: await countRows(
      service
        .from("question_source_files")
        .select("id", { count: "exact", head: true })
        .in("created_by", userIds),
      "source_asset_snapshot_failed",
    ),
  };
}

function assertSameSnapshot(before, after) {
  for (const key of Object.keys(before)) {
    assert(before[key] === after[key], `unexpected_${key}_side_effect`);
  }
}

async function expectRpcDenied(label, operation) {
  const result = await operation();
  assert(result.error, `${label}_unexpectedly_succeeded`);
  console.log(`PASS ${label}`);
}

async function expectDirectWriteDenied(label, operation) {
  const result = await operation();
  const returnedRows = Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0;
  assert(result.error || returnedRows === 0, `${label}_unexpectedly_succeeded`);
  console.log(`PASS ${label}`);
}

async function getClassroom(service, classroomId) {
  const result = await service
    .from("classrooms")
    .select("id, organization_id, owner_id, creation_request_id")
    .eq("id", classroomId)
    .single();
  return assertNoError(result, "classroom_read_failed");
}

async function getClassroomMember(service, classroomId, userId) {
  const result = await service
    .from("classroom_members")
    .select("id, role, status, user_id")
    .eq("classroom_id", classroomId)
    .eq("user_id", userId)
    .single();
  return assertNoError(result, "classroom_membership_read_failed");
}

async function countCreatorMemberships(service, classroomId, teacherId) {
  return countRows(
    service
      .from("classroom_members")
      .select("id", { count: "exact", head: true })
      .eq("classroom_id", classroomId)
      .eq("user_id", teacherId)
      .eq("role", "teacher")
      .eq("status", "active"),
    "creator_membership_count_failed",
  );
}

async function countCreatedClassrooms(service, organizationId, userId) {
  return countRows(
    service
      .from("classrooms")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("owner_id", userId),
    "classroom_count_failed",
  );
}

async function createClassroom(teacher, organizationId, requestId, runId) {
  const result = await teacher.client.rpc("create_teacher_classroom", {
    p_description: `Disposable role validation ${runId}`,
    p_name: `Disposable Classroom ${runId}`,
    p_organization_id: organizationId,
    p_request_id: requestId,
    p_subject: "Security validation",
  });
  const data = assertNoError(result, "teacher_classroom_create_failed");
  const row = Array.isArray(data) ? data[0] : data;
  assert(row?.classroom_id && row?.display_code, "teacher_classroom_create_contract_failed");
  return row;
}

async function validateRoleE2E({ anonKey, fixtures, service, url }) {
  const teacher = fixtures.teacher;
  const student = fixtures.student;
  const unrelatedTeacher = fixtures.unrelatedTeacher;
  const inactiveTeacher = fixtures.inactiveTeacher;
  const anonymous = createSessionClient(url, anonKey);
  const requestId = randomUUID();
  const beforeEffects = await snapshotNonClassroomEffects(service, fixtures);

  const created = await createClassroom(
    teacher,
    fixtures.primaryOrganizationId,
    requestId,
    fixtures.runId,
  );
  fixtures.classroomId = created.classroom_id;
  fixtures.displayCode = created.display_code;

  const createdClassroom = await getClassroom(service, fixtures.classroomId);
  assert(
    createdClassroom.owner_id === teacher.id &&
      createdClassroom.organization_id === fixtures.primaryOrganizationId &&
      createdClassroom.creation_request_id === requestId,
    "creator_identity_or_organization_contract_failed",
  );
  const creatorMembership = await getClassroomMember(service, fixtures.classroomId, teacher.id);
  fixtures.creatorMembershipId = creatorMembership.id;
  assert(
    creatorMembership.role === "teacher" && creatorMembership.status === "active",
    "creator_membership_contract_failed",
  );
  assert(
    (await countCreatorMemberships(service, fixtures.classroomId, teacher.id)) === 1,
    "creator_membership_not_exactly_once",
  );
  console.log("PASS active Teacher creates one atomic Classroom and creator membership through the RPC");

  const duplicate = await createClassroom(
    teacher,
    fixtures.primaryOrganizationId,
    requestId,
    fixtures.runId,
  );
  assert(
    duplicate.classroom_id === created.classroom_id && duplicate.display_code === created.display_code,
    "classroom_request_id_not_idempotent",
  );
  assert(
    (await countCreatorMemberships(service, fixtures.classroomId, teacher.id)) === 1,
    "idempotent_create_duplicated_creator_membership",
  );
  console.log("PASS repeated Classroom request UUID is idempotent");

  await expectRpcDenied("Student Classroom creation is denied", () =>
    student.client.rpc("create_teacher_classroom", {
      p_name: `Student denied ${fixtures.runId}`,
      p_organization_id: fixtures.primaryOrganizationId,
      p_request_id: randomUUID(),
    }),
  );
  await expectRpcDenied("Anonymous Classroom creation is denied", () =>
    anonymous.rpc("create_teacher_classroom", {
      p_name: `Anonymous denied ${fixtures.runId}`,
      p_organization_id: fixtures.primaryOrganizationId,
      p_request_id: randomUUID(),
    }),
  );
  await expectRpcDenied("Inactive Teacher Classroom creation is denied", () =>
    inactiveTeacher.client.rpc("create_teacher_classroom", {
      p_name: `Inactive denied ${fixtures.runId}`,
      p_organization_id: fixtures.primaryOrganizationId,
      p_request_id: randomUUID(),
    }),
  );
  await expectRpcDenied("Unrelated Teacher foreign-organization creation is denied", () =>
    unrelatedTeacher.client.rpc("create_teacher_classroom", {
      p_name: `Foreign denied ${fixtures.runId}`,
      p_organization_id: fixtures.primaryOrganizationId,
      p_request_id: randomUUID(),
    }),
  );
  assert(
    (await countCreatedClassrooms(service, fixtures.primaryOrganizationId, student.id)) === 0 &&
      (await countCreatedClassrooms(service, fixtures.primaryOrganizationId, inactiveTeacher.id)) === 0 &&
      (await countCreatedClassrooms(service, fixtures.primaryOrganizationId, unrelatedTeacher.id)) === 0,
    "denied_create_left_a_classroom_row",
  );

  await expectDirectWriteDenied("Teacher direct classrooms INSERT is denied", () =>
    teacher.client
      .from("classrooms")
      .insert({
        created_by: teacher.id,
        name: `Direct insert denied ${fixtures.runId}`,
        organization_id: fixtures.primaryOrganizationId,
        owner_id: teacher.id,
        status: "active",
      })
      .select("id"),
  );
  assert(
    (await countCreatedClassrooms(service, fixtures.primaryOrganizationId, teacher.id)) === 1,
    "direct_classroom_insert_created_a_row",
  );
  await expectDirectWriteDenied("Teacher direct classroom_members INSERT is denied", () =>
    teacher.client
      .from("classroom_members")
      .insert({
        classroom_id: fixtures.classroomId,
        role: "co_teacher",
        status: "active",
        user_id: inactiveTeacher.id,
      })
      .select("id"),
  );
  const inactiveMemberCount = await countRows(
    service
      .from("classroom_members")
      .select("id", { count: "exact", head: true })
      .eq("classroom_id", fixtures.classroomId)
      .eq("user_id", inactiveTeacher.id),
    "direct_membership_insert_verification_failed",
  );
  assert(inactiveMemberCount === 0, "direct_classroom_members_insert_created_a_row");
  await expectDirectWriteDenied("Teacher direct classroom_members UPDATE is denied", () =>
    teacher.client
      .from("classroom_members")
      .update({ status: "removed" })
      .eq("id", fixtures.creatorMembershipId)
      .select("id, status"),
  );
  const creatorAfterDirectUpdate = await getClassroomMember(
    service,
    fixtures.classroomId,
    teacher.id,
  );
  assert(creatorAfterDirectUpdate.status === "active", "direct_membership_update_changed_row");

  const joinResult = await student.client.rpc("join_classroom_by_code", {
    join_code: fixtures.displayCode,
  });
  const joined = assertNoError(joinResult, "student_join_by_code_failed");
  const joinedRow = Array.isArray(joined) ? joined[0] : joined;
  assert(joinedRow?.classroom_id === fixtures.classroomId, "student_join_return_contract_failed");
  const studentMembership = await getClassroomMember(service, fixtures.classroomId, student.id);
  fixtures.studentMembershipId = studentMembership.id;
  assert(
    studentMembership.role === "student" && studentMembership.status === "active",
    "student_join_membership_contract_failed",
  );
  console.log("PASS valid Student join-code enrollment works");

  await expectRpcDenied("Unrelated Teacher Classroom management is denied", () =>
    unrelatedTeacher.client.rpc("set_classroom_student_membership_status", {
      p_classroom_id: fixtures.classroomId,
      p_member_id: fixtures.studentMembershipId,
      p_status: "removed",
    }),
  );

  const removeStudent = await teacher.client.rpc("set_classroom_student_membership_status", {
    p_classroom_id: fixtures.classroomId,
    p_member_id: fixtures.studentMembershipId,
    p_status: "removed",
  });
  assertNoError(removeStudent, "teacher_student_removal_failed");
  assert(
    (await getClassroomMember(service, fixtures.classroomId, student.id)).status === "removed",
    "student_removal_not_persisted",
  );
  await expectRpcDenied("Removed Student cannot silently rejoin", () =>
    student.client.rpc("join_classroom_by_code", { join_code: fixtures.displayCode }),
  );

  const addCoTeacher = await teacher.client.rpc("add_classroom_co_teacher", {
    p_classroom_id: fixtures.classroomId,
    p_teacher_user_id: unrelatedTeacher.id,
  });
  assertNoError(addCoTeacher, "owner_add_co_teacher_failed");
  const coTeacherMembership = await getClassroomMember(
    service,
    fixtures.classroomId,
    unrelatedTeacher.id,
  );
  fixtures.coTeacherMembershipId = coTeacherMembership.id;
  assert(
    coTeacherMembership.role === "co_teacher" && coTeacherMembership.status === "active",
    "co_teacher_membership_contract_failed",
  );
  const restoreStudent = await unrelatedTeacher.client.rpc(
    "set_classroom_student_membership_status",
    {
      p_classroom_id: fixtures.classroomId,
      p_member_id: fixtures.studentMembershipId,
      p_status: "active",
    },
  );
  assertNoError(restoreStudent, "co_teacher_student_restore_failed");
  assert(
    (await getClassroomMember(service, fixtures.classroomId, student.id)).status === "active",
    "co_teacher_student_restore_not_persisted",
  );
  const removeCoTeacher = await teacher.client.rpc("remove_classroom_co_teacher", {
    p_classroom_id: fixtures.classroomId,
    p_member_id: fixtures.coTeacherMembershipId,
  });
  assertNoError(removeCoTeacher, "owner_remove_co_teacher_failed");
  assert(
    (await getClassroomMember(service, fixtures.classroomId, unrelatedTeacher.id)).status ===
      "removed",
    "co_teacher_removal_not_persisted",
  );
  await expectRpcDenied("Removed co-teacher Classroom management is denied", () =>
    unrelatedTeacher.client.rpc("set_classroom_student_membership_status", {
      p_classroom_id: fixtures.classroomId,
      p_member_id: fixtures.studentMembershipId,
      p_status: "removed",
    }),
  );
  console.log("PASS owner and co-teacher roster operations preserve authorization");

  const studentBankMemberships = await countRows(
    student.client
      .from("bank_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", student.id),
    "student_bank_access_check_failed",
  );
  assert(studentBankMemberships === 0, "classroom_join_granted_bank_membership");
  const afterEffects = await snapshotNonClassroomEffects(service, fixtures);
  assertSameSnapshot(beforeEffects, afterEffects);
  console.log("PASS Classroom operations created no Bank, Review Draft, Blueprint, Assignment, publication, source-asset, or Practice-evidence side effect");
}

async function deleteExactRows(client, table, ids, category) {
  for (const id of ids) {
    const result = await client.from(table).delete().eq("id", id);
    assertNoError(result, category);
  }
}

async function verifyAbsentCount(client, table, column, values, category) {
  if (!values.length) return;
  const remaining = await countRows(
    client.from(table).select("id", { count: "exact", head: true }).in(column, values),
    category,
  );
  assert(remaining === 0, category);
}

async function cleanupFixtures(service, fixtures) {
  const cleanupFailures = [];
  async function run(category, operation) {
    try {
      await operation();
    } catch {
      cleanupFailures.push(category);
    }
  }

  if (fixtures.classroomId) {
    await run("classroom_join_codes", async () => {
      assertNoError(
        await service.from("classroom_join_codes").delete().eq("classroom_id", fixtures.classroomId),
        "cleanup_classroom_join_codes_failed",
      );
    });
    await run("classroom_members", async () => {
      assertNoError(
        await service.from("classroom_members").delete().eq("classroom_id", fixtures.classroomId),
        "cleanup_classroom_members_failed",
      );
    });
    await run("classroom", async () => {
      assertNoError(
        await service.from("classrooms").delete().eq("id", fixtures.classroomId),
        "cleanup_classroom_failed",
      );
    });
  }

  await run("organization_members", async () => {
    await deleteExactRows(
      service,
      "organization_members",
      fixtures.organizationMemberIds,
      "cleanup_organization_member_failed",
    );
  });
  await run("profiles", async () => {
    await deleteExactRows(service, "profiles", fixtures.userIds, "cleanup_profile_failed");
  });
  await run("organizations", async () => {
    await deleteExactRows(service, "organizations", fixtures.organizationIds, "cleanup_organization_failed");
  });
  await run("auth_users", async () => {
    for (const userId of fixtures.userIds) {
      const { error } = await service.auth.admin.deleteUser(userId);
      if (error) throw new HarnessError("cleanup_auth_user_failed");
    }
  });

  await run("cleanup_verification", async () => {
    await verifyAbsentCount(
      service,
      "classrooms",
      "id",
      fixtures.classroomId ? [fixtures.classroomId] : [],
      "cleanup_classroom_verification_failed",
    );
    await verifyAbsentCount(
      service,
      "organizations",
      "id",
      fixtures.organizationIds,
      "cleanup_organization_verification_failed",
    );
    await verifyAbsentCount(
      service,
      "profiles",
      "id",
      fixtures.userIds,
      "cleanup_profile_verification_failed",
    );
    for (const userId of fixtures.userIds) {
      const { data, error } = await service.auth.admin.getUserById(userId);
      assert(error || !data?.user, "cleanup_auth_user_verification_failed");
    }
  });

  if (cleanupFailures.length > 0) {
    throw new HarnessError(`cleanup_incomplete:${cleanupFailures.join(",")}`);
  }
  console.log(`PASS disposable Classroom role fixture cleanup completed for run ${fixtures.runId}`);
}

async function main() {
  const config = requireApprovedProcessEnvironment();
  const service = createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const fixtures = {
    classroomId: null,
    coTeacherMembershipId: null,
    creatorMembershipId: null,
    displayCode: null,
    inactiveTeacher: null,
    organizationIds: [],
    organizationMemberIds: [],
    primaryOrganizationId: null,
    runId: makeOpaqueRunId(),
    student: null,
    studentMembershipId: null,
    teacher: null,
    unrelatedTeacher: null,
    userIds: [],
  };

  let validationFailure = null;
  try {
    fixtures.primaryOrganizationId = await createOrganization(
      service,
      fixtures,
      fixtures.runId,
      "primary",
    );
    const foreignOrganizationId = await createOrganization(
      service,
      fixtures,
      fixtures.runId,
      "foreign",
    );
    fixtures.teacher = await createRoleFixture({
      ...config,
      fixtures,
      organizationId: fixtures.primaryOrganizationId,
      profileStatus: "active",
      role: "teacher",
      runId: fixtures.runId,
      service,
    });
    fixtures.student = await createRoleFixture({
      ...config,
      fixtures,
      organizationId: fixtures.primaryOrganizationId,
      profileStatus: "active",
      role: "student",
      runId: fixtures.runId,
      service,
    });
    fixtures.unrelatedTeacher = await createRoleFixture({
      ...config,
      fixtures,
      organizationId: foreignOrganizationId,
      profileStatus: "active",
      role: "teacher",
      runId: fixtures.runId,
      service,
    });
    fixtures.inactiveTeacher = await createRoleFixture({
      ...config,
      fixtures,
      organizationId: fixtures.primaryOrganizationId,
      profileStatus: "disabled",
      role: "teacher",
      runId: fixtures.runId,
      service,
    });
    console.log("PASS disposable Teacher, Student, unrelated Teacher, and inactive Teacher fixtures are ready");
    await validateRoleE2E({ ...config, fixtures, service });
  } catch (error) {
    validationFailure = error;
  } finally {
    try {
      await cleanupFixtures(service, fixtures);
    } catch (cleanupError) {
      if (!validationFailure) validationFailure = cleanupError;
      else console.error(`FAIL Classroom fixture cleanup for run ${fixtures.runId} (${cleanupError.category ?? "cleanup_failed"})`);
    }
  }

  if (validationFailure) throw validationFailure;
  console.log("PASS disposable Classroom live role E2E completed");
}

try {
  await main();
} catch (error) {
  console.error(`FAIL Classroom live role E2E (${error?.category ?? "unexpected_failure"})`);
  process.exitCode = 1;
}
