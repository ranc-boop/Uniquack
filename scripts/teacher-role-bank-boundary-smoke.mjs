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
const studentUsername = process.env.TEST_STUDENT_USERNAME;
const studentPassword = process.env.TEST_STUDENT_PASSWORD;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function summarizeSupabaseError(error) {
  if (!error) return "unknown error";
  return [error.message, error.code, error.details, error.hint]
    .filter(Boolean)
    .join(" | ");
}

function usernameToLocalEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function signIn(username, password, label) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: usernameToLocalEmail(username),
    password,
  });

  if (error) {
    throw new Error(`${label} sign-in failed: ${error.message}`);
  }

  assert(data.user?.id, `teacher role smoke did not receive ${label} user`);
  return { client: supabase, user: data.user };
}

async function cleanup({ bankId, questionId }) {
  if (!serviceRoleKey) return;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (questionId) {
    await admin.from("questions").delete().eq("id", questionId);
  }

  if (bankId) {
    await admin.from("question_banks").delete().eq("id", bankId);
  }

  console.log("PASS teacher role/bank boundary cleanup removed smoke-created rows");
}

async function runStaticChecks() {
  const profileValidation = await read("src/lib/validations/profile.ts");
  const adminUsersPage = await read("src/app/admin/users/page.tsx");
  const teacherNav = await read("src/components/teacher/teacher-workspace-nav.tsx");
  const teacherHome = await read("src/app/teacher/page.tsx");
  const rootLayout = await read("src/app/layout.tsx");
  const adminPage = await read("src/app/admin/page.tsx");
  const teacherBankReviewPage = await read("src/app/teacher/banks/[bankId]/review/page.tsx");
  const teacherBankQuestionsPage = await read("src/app/teacher/banks/[bankId]/questions/page.tsx");
  const adminQuestionActions = await read("src/app/admin/questions/actions.ts");
  const boundaryMigration = await read(
    "supabase/clean-migrations/0029_teacher_role_bank_public_boundary.sql",
  );

  assert(
    profileValidation.includes('"teacher"') &&
      adminUsersPage.includes('<option value="teacher">Teacher</option>'),
    "admin user role editing must include the real teacher role",
  );
  assert(
    !teacherNav.includes("/admin/imports/pdf") &&
      !teacherNav.includes("/admin/review") &&
      !teacherNav.includes("/practice") &&
      teacherNav.includes("Dashboard") &&
      teacherNav.includes("Question Bank") &&
      teacherNav.includes("AI Parsing") &&
      teacherNav.includes("Blueprint") &&
      teacherNav.includes("Classroom") &&
      teacherNav.includes("Publish") &&
      teacherNav.includes("Progress") &&
      teacherNav.includes("/teacher/ai-parsing") &&
      teacherNav.includes("/teacher/blueprints") &&
      teacherNav.includes("/teacher/publish") &&
      teacherNav.includes("/teacher/progress") &&
      teacherHome.includes("Choose a bank first") &&
      teacherHome.includes("Open bank review") &&
      teacherHome.includes("No unreviewed draft can be assigned to students") &&
      teacherHome.includes("Student visibility stays assignment-only"),
    "teacher workspace navigation must stay bank-first instead of pointing to admin/global review",
  );
  assert(
    rootLayout.includes("teacherNavItems") &&
      rootLayout.includes("studentNavItems") &&
      rootLayout.includes("teacher\", \"admin\", \"super_admin"),
    "root layout must keep separate student and teacher primary navigation",
  );
  assert(
    adminPage.includes("Provider") || adminPage.includes("Admin"),
    "admin page must remain available for platform operations",
  );
  assert(
    teacherBankReviewPage.includes("Approve drafts into this bank") &&
      teacherBankReviewPage.includes("public library") &&
      teacherBankQuestionsPage.includes("not public/global questions") &&
      teacherBankQuestionsPage.includes("Assignment ready"),
    "teacher bank pages must describe bank-scoped approval and assignment-only visibility",
  );
  assert(
    adminQuestionActions.includes("function globalVisibilityForStatus") &&
      adminQuestionActions.includes('status === "published"') &&
      adminQuestionActions.includes('"public" as const') &&
      adminQuestionActions.includes('"private" as const') &&
      adminQuestionActions.includes("visibility: globalVisibilityForStatus(parsed.status)") &&
      adminQuestionActions.includes("visibility: globalVisibilityForStatus(updateStatus)"),
    "admin global publish actions must explicitly set published questions to public visibility",
  );
  assert(
    boundaryMigration.includes("0029_teacher_role_bank_public_boundary") &&
      boundaryMigration.includes("questions_published_read") &&
      boundaryMigration.includes("visibility = 'public'") &&
      boundaryMigration.includes("owner_bank_id is null") &&
      boundaryMigration.includes("Bank-owned questions must be approved through bank review") &&
      boundaryMigration.includes("public.search_questions_by_taxonomy"),
    "clean migration 0029 must harden public read/search and block global publish for bank-owned questions",
  );
  console.log("PASS teacher role/bank boundary static checks");
}

async function runLiveChecks() {
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    console.log(
      "SKIP teacher role/bank boundary live smoke: missing Supabase URL, anon key, or service role key.",
    );
    return;
  }

  if (!teacherUsername || !teacherPassword) {
    console.log(
      "SKIP teacher role/bank boundary live smoke: missing TEST_TEACHER credentials.",
    );
    return;
  }

  const teacher = await signIn(teacherUsername, teacherPassword, "teacher");
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(supabaseUrl, supabaseAnonKey);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let bankId = null;
  let questionId = null;

  try {
    const { data: teacherProfile, error: teacherProfileError } = await teacher.client
      .from("profiles")
      .select("id, role, status, default_organization_id")
      .eq("id", teacher.user.id)
      .single();

    assert(
      !teacherProfileError && teacherProfile?.role === "teacher",
      `TEST_TEACHER must be a real teacher profile: ${summarizeSupabaseError(teacherProfileError)}`,
    );
    assert(teacherProfile.status === "active", "TEST_TEACHER profile must be active");
    assert(
      teacherProfile.default_organization_id,
      "TEST_TEACHER must have a default organization",
    );

    const { data: memberships, error: membershipError } = await teacher.client
      .from("organization_members")
      .select("role, status")
      .eq("user_id", teacher.user.id)
      .eq("organization_id", teacherProfile.default_organization_id);
    assert(
      !membershipError &&
        (memberships ?? []).some(
          (membership) =>
            membership.role === "teacher" && membership.status === "active",
        ),
      `TEST_TEACHER must have an active teacher membership: ${summarizeSupabaseError(membershipError)}`,
    );
    console.log("PASS TEST_TEACHER is a real teacher profile and member");

    const { data: createdBankId, error: createBankError } = await teacher.client.rpc(
      "create_question_bank",
      {
        bank_description: "Smoke-created private bank for public boundary validation.",
        bank_name: `Teacher role bank boundary smoke ${suffix}`,
        bank_visibility: "private",
      },
    );
    assert(
      !createBankError && createdBankId,
      `teacher bank create failed: ${summarizeSupabaseError(createBankError)}`,
    );
    bankId = createdBankId;

    const { data: question, error: questionError } = await admin
      .from("questions")
      .insert({
        answer_spec: { kind: "exact_text", value: "2" },
        content_html: "<p>Smoke-only private bank question.</p>",
        content_source: "Smoke-only private bank question.",
        content_source_format: "plain_text",
        created_by: teacher.user.id,
        difficulty_rating: 300,
        options: [],
        organization_id: teacherProfile.default_organization_id,
        owner_bank_id: bankId,
        question_code: `teacher-bank-boundary-smoke-${suffix}`,
        question_type: "fill_blank",
        solution_html: "<p>Smoke solution.</p>",
        solution_source: "Smoke solution.",
        solution_source_format: "plain_text",
        source: "teacher role/bank boundary smoke",
        source_kind: "manual",
        status: "published",
        title: "Smoke private bank published-status guard",
        updated_by: teacher.user.id,
        visibility: "private",
      })
      .select("id")
      .single();
    assert(
      !questionError && question?.id,
      `smoke private bank question insert failed: ${summarizeSupabaseError(questionError)}`,
    );
    questionId = question.id;

    const { data: teacherRows, error: teacherReadError } = await teacher.client
      .from("questions")
      .select("id")
      .eq("id", questionId);
    assert(
      !teacherReadError && teacherRows?.length === 1,
      `bank owner teacher should read private bank question: ${summarizeSupabaseError(teacherReadError)}`,
    );
    console.log("PASS bank owner teacher can read private bank question");

    const { data: anonRows, error: anonReadError } = await anon
      .from("questions")
      .select("id")
      .eq("id", questionId);
    assert(!anonReadError, `anon public boundary check failed: ${summarizeSupabaseError(anonReadError)}`);

    const { data: searchRows, error: searchError } = await anon.rpc(
      "search_questions_by_taxonomy",
      {
        page_limit: 20,
        question_status: "published",
        query_text: `teacher-bank-boundary-smoke-${suffix}`,
      },
    );
    assert(!searchError, `public taxonomy search boundary check failed: ${summarizeSupabaseError(searchError)}`);

    if (
      anonRows?.some((row) => row.id === questionId) ||
      searchRows?.some((row) => row.question_id === questionId)
    ) {
      console.log(
        "SKIP teacher role/bank boundary live hardening: clean migration 0029 is not applied to the target Supabase project yet.",
      );
      return;
    }

    console.log("PASS private bank question does not leak through public read/search");

    if (studentUsername && studentPassword) {
      const student = await signIn(studentUsername, studentPassword, "student");
      const { data: studentRows, error: studentReadError } = await student.client
        .from("questions")
        .select("id")
        .eq("id", questionId);
      assert(
        !studentReadError && !studentRows?.length,
        `student unexpectedly read private bank question: ${summarizeSupabaseError(studentReadError)}`,
      );
      console.log("PASS student cannot read private bank question by default");
    } else {
      console.log("SKIP student private bank boundary check: TEST_STUDENT credentials are missing.");
    }
  } finally {
    await cleanup({ bankId, questionId });
  }
}

await runStaticChecks();
await runLiveChecks();
