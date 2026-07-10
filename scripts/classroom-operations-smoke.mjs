import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");
dotenv.config({ path: resolve(root, ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.CLEAN_SUPABASE_SERVICE_ROLE_KEY;
const teacherUsername =
  process.env.TEST_TEACHER_USERNAME ?? process.env.TEST_ADMIN_USERNAME;
const teacherPassword =
  process.env.TEST_TEACHER_PASSWORD ?? process.env.TEST_ADMIN_PASSWORD;
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;
const coTeacherUsername =
  process.env.TEST_SECOND_TEACHER_USERNAME ?? process.env.TEST_TEACHER_B_USERNAME;
const coTeacherPassword =
  process.env.TEST_SECOND_TEACHER_PASSWORD ?? process.env.TEST_TEACHER_B_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function summarizeSupabaseError(error) {
  if (!error) return "unknown error";
  return [error.message, error.code, error.details, error.hint].filter(Boolean).join(" | ");
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

function normalizeJoinCode(code) {
  return code.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function hashJoinCode(code) {
  return createHash("sha256").update(normalizeJoinCode(code), "utf8").digest("hex");
}

function joinCodeHint(code) {
  const normalized = normalizeJoinCode(code);
  return normalized ? `...${normalized.slice(-4)}` : null;
}

function randomJoinCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length])
    .join("")
    .replace(/^(.{4})(.{4})$/, "$1-$2");
}

async function signIn(username, password, label) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });

  if (error) {
    console.log(`SKIP classroom operations live smoke: ${label} sign-in failed.`);
    return null;
  }

  assert(data.user?.id, `classroom operations smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function resolveOrganizationId(supabase, userId) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, status, default_organization_id")
    .eq("id", userId)
    .single();

  assert(
    !profileError,
    `classroom operations profile lookup failed: ${summarizeSupabaseError(profileError)}`,
  );
  assert(profile?.status === "active", "classroom operations smoke requires active profile");
  assert(
    ["teacher", "admin", "super_admin"].includes(profile.role),
    "classroom operations smoke teacher account must be teacher/admin/super_admin",
  );

  if (profile.default_organization_id) return profile.default_organization_id;

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("organization_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["teacher", "admin"])
    .limit(1);

  assert(!error, `classroom operations org lookup failed: ${summarizeSupabaseError(error)}`);
  assert(memberships?.[0]?.organization_id, "classroom operations found no teacher org");
  return memberships[0].organization_id;
}

async function insertJoinCode(client, classroomId, userId, code) {
  const { error } = await client.from("classroom_join_codes").insert({
    classroom_id: classroomId,
    code_hash: hashJoinCode(code),
    code_hint: joinCodeHint(code),
    created_by: userId,
    display_code: code,
    status: "active",
  });

  assert(!error, `join-code insert failed: ${summarizeSupabaseError(error)}`);
}

async function countBankMemberships(client, userIds) {
  const { count, error } = await client
    .from("bank_members")
    .select("id", { count: "exact", head: true })
    .in("user_id", userIds);

  assert(!error, `bank membership count failed: ${summarizeSupabaseError(error)}`);
  return count ?? 0;
}

async function runSourceSmoke() {
  const actions = await read("src/app/teacher/classrooms/actions.ts");
  const overview = await read("src/app/teacher/classrooms/[id]/page.tsx");
  const students = await read("src/app/teacher/classrooms/[id]/students/page.tsx");
  const teachers = await read("src/app/teacher/classrooms/[id]/teachers/page.tsx");
  const settings = await read("src/app/teacher/classrooms/[id]/settings/page.tsx");
  const assignmentsAction = await read("src/app/teacher/classrooms/[id]/assignments/actions.ts");
  const publishActions = await read("src/app/teacher/publish/actions.ts");
  const blueprints = await read("src/app/teacher/classrooms/[id]/blueprints/page.tsx");
  const helpers = await read("src/lib/teacher-classrooms.ts");
  const classroomMigration = await read("supabase/clean-migrations/0018_classroom_foundation.sql");
  const joinCodeMigration = await read(
    "supabase/clean-migrations/0019_classroom_join_code_display_and_roster_removal.sql",
  );

  assert(
    overview.includes("Class delivery snapshot") &&
      overview.includes("studentsNeedingAttention") &&
      overview.includes("Manage joining") &&
      helpers.includes("coTeacherCount") &&
      helpers.includes("assignmentSummary") &&
      helpers.includes("student_assignment_progress") &&
      helpers.includes("assignment_practice_sessions"),
    "classroom overview must show real roster, team, assignment, evidence, and join status summaries",
  );
  assert(
    settings.includes("action={updateClassroomSettings}") &&
      settings.includes("Join-code lifecycle") &&
      settings.includes("Rotate join code") &&
      settings.includes("Disable joining") &&
      settings.includes("Archive classroom") &&
      settings.includes("Reopen classroom") &&
      actions.includes("updateClassroomSettings") &&
      actions.includes("rotateClassroomJoinCode") &&
      actions.includes("disableClassroomJoining") &&
      actions.includes("archiveClassroom") &&
      actions.includes("reopenClassroom") &&
      actions.includes('status: "archived"') &&
      actions.includes('status: "revoked"'),
    "settings must provide server-authorized metadata, join-code, archive, and reopen operations",
  );
  assert(
    students.includes("Remove from active roster") &&
      students.includes("Restore to active roster") &&
      students.includes("preserve all history") &&
      actions.includes("removeClassroomStudent") &&
      actions.includes("restoreClassroomStudent") &&
      !actions.includes(".delete("),
    "student roster operations must use soft status changes and preserve history",
  );
  assert(
    teachers.includes("Add co-teacher") &&
      teachers.includes("source Question Banks") &&
      teachers.includes("provider settings") &&
      actions.includes("getOwnerClassroomForAction") &&
      actions.includes("addClassroomCoTeacher") &&
      actions.includes("removeClassroomCoTeacher") &&
      !actions.includes("bank_members"),
    "co-teacher operations must be owner controlled and must not grant bank membership",
  );
  assert(
    assignmentsAction.includes('classroom.status !== "active"') &&
      publishActions.includes('.eq("status", "active")'),
    "archived classrooms must be blocked from new assignments and Publish targets",
  );
  assert(
    blueprints.includes("not sent directly to students") &&
      !blueprints.includes("generate original") &&
      !blueprints.includes("auto-publish"),
    "linked Blueprint planning must remain reference-only",
  );
  assert(
    classroomMigration.includes("status text not null default 'active'") &&
      classroomMigration.includes("role text not null") &&
      classroomMigration.includes("status text not null default 'active'") &&
      classroomMigration.includes("public.join_classroom_by_code") &&
      joinCodeMigration.includes("display_code") &&
      joinCodeMigration.includes("Teacher-visible classroom enrollment code"),
    "existing classroom schema must support lifecycle, memberships, and join-code display",
  );
  assert(
    !actions.includes("AI_PROVIDER") &&
      !settings.includes("provider") &&
      !students.includes("self-study") &&
      !teachers.includes("Public Library"),
    "classroom operations must not touch providers, private self-study, or public library behavior",
  );

  console.log("PASS classroom operations source checks");
}

async function runLiveSmoke() {
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    console.log(
      "SKIP classroom operations live smoke: missing Supabase URL/anon/service-role env.",
    );
    return;
  }
  if (!teacherUsername || !teacherPassword || !studentUsername || !studentPassword) {
    console.log("SKIP classroom operations live smoke: missing teacher/student test credentials.");
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher");
  const student = await signIn(studentUsername, studentPassword, "student");
  if (!teacher || !student) return;

  const service = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  const organizationId = await resolveOrganizationId(teacher.client, teacher.user.id);
  const firstCode = randomJoinCode();
  const touched = {
    assignmentIds: [],
    classroomId: null,
    feedbackIds: [],
    progressIds: [],
  };
  const membershipCountBefore = await countBankMemberships(service, [
    teacher.user.id,
    student.user.id,
  ]);

  const { data: classroomRows, error: createError } = await teacher.client.rpc(
    "create_teacher_classroom",
    {
      p_description: "Classroom operations smoke classroom",
      p_join_code: firstCode,
      p_name: `Classroom operations smoke ${Date.now()}`,
      p_organization_id: organizationId,
      p_subject: "Smoke operations",
    },
  );

  if (createError?.message?.includes("function public.create_teacher_classroom")) {
    console.log("SKIP classroom operations live smoke: classroom RPC is not applied remotely.");
    return;
  }

  assert(!createError, `teacher classroom RPC failed: ${summarizeSupabaseError(createError)}`);
  const classroom = Array.isArray(classroomRows) ? classroomRows[0] : classroomRows;
  assert(classroom?.classroom_id, "classroom RPC did not return classroom_id");
  touched.classroomId = classroom.classroom_id;

  try {
    const { data: preJoinRead, error: preJoinReadError } = await student.client
      .from("classrooms")
      .select("id")
      .eq("id", classroom.classroom_id);
    assert(
      !preJoinReadError,
      `student pre-join read errored: ${summarizeSupabaseError(preJoinReadError)}`,
    );
    assert((preJoinRead ?? []).length === 0, "student read classroom before joining");

    const { error: joinError } = await student.client.rpc("join_classroom_by_code", {
      join_code: firstCode,
    });
    assert(!joinError, `student join failed: ${summarizeSupabaseError(joinError)}`);

    const secondCode = randomJoinCode();
    const { error: revokeForRotateError } = await teacher.client
      .from("classroom_join_codes")
      .update({ status: "revoked" })
      .eq("classroom_id", classroom.classroom_id)
      .eq("status", "active");
    assert(
      !revokeForRotateError,
      `join-code rotation revoke failed: ${summarizeSupabaseError(revokeForRotateError)}`,
    );
    await insertJoinCode(teacher.client, classroom.classroom_id, teacher.user.id, secondCode);

    const { error: oldCodeError } = await student.client.rpc("join_classroom_by_code", {
      join_code: firstCode,
    });
    assert(oldCodeError, "old rotated join code unexpectedly remained valid");

    const { error: disableError } = await teacher.client
      .from("classroom_join_codes")
      .update({ status: "revoked" })
      .eq("classroom_id", classroom.classroom_id)
      .eq("status", "active");
    assert(!disableError, `join-code disable failed: ${summarizeSupabaseError(disableError)}`);

    const { error: disabledJoinError } = await student.client.rpc("join_classroom_by_code", {
      join_code: secondCode,
    });
    assert(disabledJoinError, "disabled join code unexpectedly worked");

    const thirdCode = randomJoinCode();
    await insertJoinCode(teacher.client, classroom.classroom_id, teacher.user.id, thirdCode);
    const { error: enabledJoinError } = await student.client.rpc("join_classroom_by_code", {
      join_code: thirdCode,
    });
    assert(!enabledJoinError, `enabled join code failed: ${summarizeSupabaseError(enabledJoinError)}`);

    const { error: editError } = await teacher.client
      .from("classrooms")
      .update({
        description: "Updated by classroom operations smoke",
        name: "Classroom operations smoke edited",
        subject: "Smoke edited",
        updated_by: teacher.user.id,
      })
      .eq("id", classroom.classroom_id);
    assert(!editError, `classroom metadata edit failed: ${summarizeSupabaseError(editError)}`);

    const { data: assignment, error: assignmentError } = await service
      .from("assignments")
      .insert({
        assigned_at: new Date().toISOString(),
        classroom_id: classroom.classroom_id,
        created_by: teacher.user.id,
        due_at: null,
        instructions: "Smoke assignment for evidence preservation.",
        organization_id: organizationId,
        status: "assigned",
        title: "Classroom operations smoke assignment",
      })
      .select("id")
      .single();
    assert(!assignmentError, `assignment create failed: ${summarizeSupabaseError(assignmentError)}`);
    touched.assignmentIds.push(assignment.id);

    const { data: progress, error: progressError } = await service
      .from("student_assignment_progress")
      .insert({
        assignment_id: assignment.id,
        completed_at: new Date().toISOString(),
        evidence_summary: { smoke: true },
        last_practice_session_id: null,
        started_at: new Date().toISOString(),
        status: "completed",
        student_id: student.user.id,
      })
      .select("id")
      .single();
    assert(!progressError, `progress create failed: ${summarizeSupabaseError(progressError)}`);
    touched.progressIds.push(progress.id);

    const { data: feedback, error: feedbackError } = await teacher.client
      .from("teacher_feedback_notes")
      .insert({
        assignment_id: assignment.id,
        author_id: teacher.user.id,
        body: "Classroom operations smoke feedback.",
        classroom_id: classroom.classroom_id,
        organization_id: organizationId,
        practice_attempt_id: null,
        question_id: null,
        status: "draft",
        student_id: student.user.id,
        visibility: "private_teacher",
      })
      .select("id")
      .single();
    assert(!feedbackError, `feedback note create failed: ${summarizeSupabaseError(feedbackError)}`);
    touched.feedbackIds.push(feedback.id);

    const { error: removeError } = await teacher.client
      .from("classroom_members")
      .update({ status: "removed" })
      .eq("classroom_id", classroom.classroom_id)
      .eq("user_id", student.user.id)
      .eq("role", "student");
    assert(!removeError, `student soft remove failed: ${summarizeSupabaseError(removeError)}`);

    const { data: remainingProgress, error: remainingProgressError } = await service
      .from("student_assignment_progress")
      .select("id")
      .eq("id", progress.id)
      .maybeSingle();
    assert(
      !remainingProgressError && remainingProgress?.id === progress.id,
      "student progress was not preserved after roster removal",
    );
    const { data: remainingFeedback, error: remainingFeedbackError } = await service
      .from("teacher_feedback_notes")
      .select("id")
      .eq("id", feedback.id)
      .maybeSingle();
    assert(
      !remainingFeedbackError && remainingFeedback?.id === feedback.id,
      "teacher feedback was not preserved after roster removal",
    );

    const { error: archiveError } = await teacher.client
      .from("classrooms")
      .update({ status: "archived", updated_by: teacher.user.id })
      .eq("id", classroom.classroom_id);
    assert(!archiveError, `classroom archive failed: ${summarizeSupabaseError(archiveError)}`);
    await teacher.client
      .from("classroom_join_codes")
      .update({ status: "revoked" })
      .eq("classroom_id", classroom.classroom_id)
      .eq("status", "active");

    const { error: archivedJoinError } = await student.client.rpc("join_classroom_by_code", {
      join_code: thirdCode,
    });
    assert(archivedJoinError, "archived classroom unexpectedly accepted a join");

    const { error: reopenError } = await teacher.client
      .from("classrooms")
      .update({ status: "active", updated_by: teacher.user.id })
      .eq("id", classroom.classroom_id);
    assert(!reopenError, `classroom reopen failed: ${summarizeSupabaseError(reopenError)}`);

    if (coTeacherUsername && coTeacherPassword) {
      const coTeacher = await signIn(coTeacherUsername, coTeacherPassword, "co-teacher");
      if (coTeacher) {
        const { error: coTeacherInsertError } = await teacher.client
          .from("classroom_members")
          .insert({
            classroom_id: classroom.classroom_id,
            role: "co_teacher",
            status: "active",
            user_id: coTeacher.user.id,
          });
        assert(
          !coTeacherInsertError,
          `co-teacher add failed: ${summarizeSupabaseError(coTeacherInsertError)}`,
        );
        const { data: coTeacherRead, error: coTeacherReadError } = await coTeacher.client
          .from("classrooms")
          .select("id")
          .eq("id", classroom.classroom_id);
        assert(
          !coTeacherReadError && coTeacherRead?.length === 1,
          "co-teacher could not read classroom after membership",
        );
      }
    } else {
      console.log("SKIP co-teacher live add/remove: no second teacher credentials configured.");
    }

    const membershipCountAfter = await countBankMemberships(service, [
      teacher.user.id,
      student.user.id,
    ]);
    assert(
      membershipCountAfter === membershipCountBefore,
      "classroom operations unexpectedly changed bank memberships",
    );

    console.log("PASS classroom operations live smoke");
  } finally {
    if (touched.classroomId) {
      if (touched.feedbackIds.length) {
        await service.from("teacher_feedback_notes").delete().in("id", touched.feedbackIds);
      }
      if (touched.progressIds.length) {
        await service.from("student_assignment_progress").delete().in("id", touched.progressIds);
      }
      if (touched.assignmentIds.length) {
        await service.from("assignment_items").delete().in("assignment_id", touched.assignmentIds);
        await service.from("assignments").delete().in("id", touched.assignmentIds);
      }
      await service.from("classroom_join_codes").delete().eq("classroom_id", touched.classroomId);
      await service.from("classroom_members").delete().eq("classroom_id", touched.classroomId);
      await service.from("classrooms").delete().eq("id", touched.classroomId);
    }
  }
}

await runSourceSmoke();
await runLiveSmoke();
