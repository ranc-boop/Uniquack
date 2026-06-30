import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "..", ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function summarizeSupabaseError(error) {
  if (!error) return "unknown error";
  const pieces = [error.message, error.code, error.details, error.hint].filter(Boolean);
  return pieces.join(" | ");
}

function usernameToEmail(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@local.app`;
}

async function signIn(usernameEnv, passwordEnv) {
  const username = process.env[usernameEnv];
  const password = process.env[passwordEnv];
  if (!username || !password) {
    throw new Error(`Missing ${usernameEnv} or ${passwordEnv}.`);
  }
  const client = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error || !data.user) {
    throw new Error(`${usernameEnv} sign-in failed: ${error?.message ?? "No user returned."}`);
  }
  return { client, user: data.user };
}

async function resolveAdminOrganization(client, userId) {
  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("id,default_organization_id,role,status")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`admin profile lookup failed: ${summarizeSupabaseError(profileError)}`);
  }

  if (profile?.default_organization_id) {
    pass("batch smoke resolved admin organization from profile default_organization_id");
    return {
      organizationId: profile.default_organization_id,
      source: "profiles.default_organization_id",
    };
  }

  const { data: memberships, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id,role,status,created_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["admin", "teacher"])
    .order("role", { ascending: true })
    .order("created_at", { ascending: true });

  if (membershipError) {
    throw new Error(`admin organization membership lookup failed: ${summarizeSupabaseError(membershipError)}`);
  }

  const membership = memberships?.[0];
  if (membership?.organization_id) {
    const source =
      (memberships?.length ?? 0) > 1
        ? `organization_members active ${membership.role} membership; chose first deterministic row from ${memberships.length}`
        : `organization_members active ${membership.role} membership`;
    pass(`batch smoke resolved admin organization from ${source}`);
    return {
      organizationId: membership.organization_id,
      source,
    };
  }

  throw new Error(
    "no admin organization found: profile has no default_organization_id and no active admin/teacher organization_members row",
  );
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
}

const admin = await signIn("TEST_ADMIN_USERNAME", "TEST_ADMIN_PASSWORD");
const adminOrganization = await resolveAdminOrganization(admin.client, admin.user.id);
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const cleanup = { assignments: [], batches: [], questions: [] };

try {
  const { data: tag, error: tagError } = await admin.client
    .from("taxonomy_nodes")
    .select("tag_id")
    .eq("status", "active")
    .eq("is_assignable", true)
    .limit(1)
    .maybeSingle();
  assert(!tagError && tag?.tag_id, `taxonomy seed lookup failed: ${tagError?.message}`);
  pass("batch smoke can read active assignable taxonomy tag IDs");

  const { data: batch, error: batchError } = await admin.client
    .from("import_batches")
    .insert({
      source_type: "manual_json",
      status: "draft",
      summary: { smoke: true },
      organization_id: adminOrganization.organizationId,
      created_by: admin.user.id,
    })
    .select("id")
    .single();
  assert(!batchError && batch, `import batch insert failed: ${summarizeSupabaseError(batchError)}`);
  cleanup.batches.push(batch.id);

  const questionCode = `BATCH-SMOKE-${suffix}`.toUpperCase().slice(0, 80);
  const { data: question, error: questionError } = await admin.client
    .from("questions")
    .insert({
      organization_id: adminOrganization.organizationId,
      question_code: questionCode,
      title: "Batch smoke taxonomy question",
      content_html: "<p>Batch smoke content</p>",
      solution_html: "<p>Batch smoke solution</p>",
      difficulty_rating: 500,
      question_type: "frq",
      status: "draft",
      created_by: admin.user.id,
      updated_by: admin.user.id,
    })
    .select("id")
    .single();
  assert(!questionError && question, `question insert failed: ${summarizeSupabaseError(questionError)}`);
  cleanup.questions.push(question.id);

  const { data: assignment, error: assignmentError } = await admin.client
    .from("question_taxonomy_assignments")
    .insert({
      question_id: question.id,
      tag_id: tag.tag_id,
      review_status: "pending_review",
      source: "batch_import",
      created_by: admin.user.id,
      updated_by: admin.user.id,
    })
    .select("id,question_id,tag_id")
    .single();
  assert(!assignmentError && assignment, `taxonomy assignment insert failed: ${summarizeSupabaseError(assignmentError)}`);
  cleanup.assignments.push(assignment.id);
  pass("batch smoke binds imported questions through exact tag_ids");

  const { data: rpcRows, error: rpcError } = await admin.client.rpc("search_questions_by_taxonomy", {
    assignment_review_status: null,
    difficulty_max: 1000,
    difficulty_min: 0,
    exclude_tag_ids: [],
    include_tag_ids: [tag.tag_id],
    page_limit: 5,
    page_offset: 0,
    query_text: questionCode,
    question_status: null,
  });
  assert(!rpcError, `taxonomy RPC failed: ${rpcError?.message}`);
  assert(
    (rpcRows ?? []).some((row) => row.question_id === question.id),
    "taxonomy RPC did not find the imported taxonomy-bound question",
  );
  pass("batch smoke verifies native taxonomy search for exact tag_ids");
} finally {
  const cleanupErrors = [];
  for (const id of cleanup.assignments) {
    const { error } = await admin.client.from("question_taxonomy_assignments").delete().eq("id", id);
    if (error) cleanupErrors.push(`assignment ${id}: ${summarizeSupabaseError(error)}`);
  }
  for (const id of cleanup.questions) {
    const { error } = await admin.client
      .from("questions")
      .delete()
      .eq("id", id)
      .eq("organization_id", adminOrganization.organizationId);
    if (error) cleanupErrors.push(`question ${id}: ${summarizeSupabaseError(error)}`);
  }
  for (const id of cleanup.batches) {
    const { error } = await admin.client
      .from("import_batches")
      .delete()
      .eq("id", id)
      .eq("organization_id", adminOrganization.organizationId);
    if (error) cleanupErrors.push(`import batch ${id}: ${summarizeSupabaseError(error)}`);
  }

  if (cleanupErrors.length > 0) {
    throw new Error(`batch smoke cleanup failed: ${cleanupErrors.join("; ")}`);
  }
}
