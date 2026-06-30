#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const CONFIRMATION_PHRASE = "BOOTSTRAP_CLEAN_SUPABASE";
const REQUIRED_TABLES = ["organizations", "profiles", "organization_members"];
const ADMIN_PROFILE_ROLES = new Set(["admin", "super_admin"]);

function printHelp() {
  console.log(`
Clean Supabase auth bootstrap draft

Usage:
  node scripts/clean-supabase-auth-bootstrap.mjs [--dry-run|--validate-only|--execute]

Default mode is --dry-run.

Required environment variables:
  CLEAN_SUPABASE_URL
  CLEAN_SUPABASE_SERVICE_ROLE_KEY
  BOOTSTRAP_ORGANIZATION_NAME
  BOOTSTRAP_ORGANIZATION_SLUG
  BOOTSTRAP_ADMIN_EMAIL
  BOOTSTRAP_ADMIN_PASSWORD or BOOTSTRAP_ADMIN_INVITE_ONLY=1
  BOOTSTRAP_CONFIRM=BOOTSTRAP_CLEAN_SUPABASE
  BOOTSTRAP_MODE=disposable

Optional environment variables:
  BOOTSTRAP_TEACHER_EMAIL
  BOOTSTRAP_TEACHER_PASSWORD
  BOOTSTRAP_STUDENT_EMAIL
  BOOTSTRAP_STUDENT_PASSWORD

This script never reads .env.local automatically and never prints secrets.
`);
}

function parseArgs(argv) {
  const args = new Set(argv);
  if (args.has("--help") || args.has("-h")) {
    return { help: true, mode: "help" };
  }

  const selected = ["--dry-run", "--validate-only", "--execute"].filter((arg) =>
    args.has(arg),
  );
  if (selected.length > 1) {
    throw new Error("Choose only one mode: --dry-run, --validate-only, or --execute.");
  }

  const mode = args.has("--execute")
    ? "execute"
    : args.has("--validate-only")
      ? "validate-only"
      : "dry-run";

  const unknown = [...args].filter(
    (arg) => !["--dry-run", "--validate-only", "--execute"].includes(arg),
  );
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(", ")}`);
  }

  return { help: false, mode };
}

function getEnv(name) {
  return process.env[name]?.trim() ?? "";
}

function isTruthy(value) {
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function requireEnv(name, errors) {
  const value = getEnv(name);
  if (!value) errors.push(`missing_env:${name}`);
  return value;
}

function validateEmail(name, value, errors) {
  if (!value) return;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
    errors.push(`invalid_email:${name}`);
  }
}

function validateSlug(value, errors) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    errors.push("invalid_slug:BOOTSTRAP_ORGANIZATION_SLUG");
  }
}

function validateUrl(value, errors) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      errors.push("invalid_url:CLEAN_SUPABASE_URL_must_use_https");
    }
    if (!url.hostname.endsWith(".supabase.co")) {
      errors.push("invalid_url:CLEAN_SUPABASE_URL_must_be_supabase_project_url");
    }
    if (/(prod|production|live|legacy|old)/i.test(url.hostname)) {
      errors.push("unsafe_target:CLEAN_SUPABASE_URL_looks_live_or_legacy");
    }
  } catch {
    errors.push("invalid_url:CLEAN_SUPABASE_URL");
  }
}

function buildConfig() {
  const errors = [];
  const url = requireEnv("CLEAN_SUPABASE_URL", errors);
  const serviceRoleKey = requireEnv("CLEAN_SUPABASE_SERVICE_ROLE_KEY", errors);
  const organizationName = requireEnv("BOOTSTRAP_ORGANIZATION_NAME", errors);
  const organizationSlug = requireEnv("BOOTSTRAP_ORGANIZATION_SLUG", errors);
  const adminEmail = requireEnv("BOOTSTRAP_ADMIN_EMAIL", errors);
  const adminPassword = getEnv("BOOTSTRAP_ADMIN_PASSWORD");
  const adminInviteOnly = isTruthy(getEnv("BOOTSTRAP_ADMIN_INVITE_ONLY"));
  const confirmation = requireEnv("BOOTSTRAP_CONFIRM", errors);
  const mode = getEnv("BOOTSTRAP_MODE");
  const teacherEmail = getEnv("BOOTSTRAP_TEACHER_EMAIL");
  const teacherPassword = getEnv("BOOTSTRAP_TEACHER_PASSWORD");
  const studentEmail = getEnv("BOOTSTRAP_STUDENT_EMAIL");
  const studentPassword = getEnv("BOOTSTRAP_STUDENT_PASSWORD");

  if (url) validateUrl(url, errors);
  if (organizationSlug) validateSlug(organizationSlug, errors);
  validateEmail("BOOTSTRAP_ADMIN_EMAIL", adminEmail, errors);
  validateEmail("BOOTSTRAP_TEACHER_EMAIL", teacherEmail, errors);
  validateEmail("BOOTSTRAP_STUDENT_EMAIL", studentEmail, errors);

  if (confirmation !== CONFIRMATION_PHRASE) {
    errors.push("invalid_confirmation:BOOTSTRAP_CONFIRM");
  }
  if (mode !== "disposable") {
    errors.push("unsafe_target:BOOTSTRAP_MODE_must_be_disposable");
  }
  if (!adminPassword && !adminInviteOnly) {
    errors.push("missing_env:BOOTSTRAP_ADMIN_PASSWORD_or_BOOTSTRAP_ADMIN_INVITE_ONLY");
  }
  if (teacherEmail && !teacherPassword) {
    errors.push("missing_env:BOOTSTRAP_TEACHER_PASSWORD");
  }
  if (teacherPassword && !teacherEmail) {
    errors.push("missing_env:BOOTSTRAP_TEACHER_EMAIL");
  }
  if (studentEmail && !studentPassword) {
    errors.push("missing_env:BOOTSTRAP_STUDENT_PASSWORD");
  }
  if (studentPassword && !studentEmail) {
    errors.push("missing_env:BOOTSTRAP_STUDENT_EMAIL");
  }

  if (errors.length > 0) {
    const err = new Error("Bootstrap configuration failed validation.");
    err.validationErrors = errors;
    throw err;
  }

  return {
    url,
    serviceRoleKey,
    organizationName,
    organizationSlug,
    users: [
      {
        label: "admin",
        email: adminEmail.toLowerCase(),
        password: adminPassword,
        inviteOnly: adminInviteOnly,
        profileRole: "super_admin",
        membershipRole: "admin",
      },
      ...(teacherEmail
        ? [
            {
              label: "teacher",
              email: teacherEmail.toLowerCase(),
              password: teacherPassword,
              inviteOnly: false,
              profileRole: "teacher",
              membershipRole: "teacher",
            },
          ]
        : []),
      ...(studentEmail
        ? [
            {
              label: "student",
              email: studentEmail.toLowerCase(),
              password: studentPassword,
              inviteOnly: false,
              profileRole: "student",
              membershipRole: "student",
            },
          ]
        : []),
    ],
  };
}

function createSupabase(config) {
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function assertRequiredTables(supabase) {
  const missing = [];
  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select("id", {
      count: "exact",
      head: true,
    });
    if (error) missing.push(`${table}:${error.code ?? error.message}`);
  }
  if (missing.length > 0) {
    throw new Error(`Missing or unreadable clean tables: ${missing.join(", ")}`);
  }
}

async function listAllAuthUsers(supabase) {
  const users = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    users.push(...(data?.users ?? []));
    if (!data?.users || data.users.length < perPage) break;
    page += 1;
  }

  return users;
}

async function findAuthUserByEmail(supabase, email) {
  const users = await listAllAuthUsers(supabase);
  return users.find((user) => user.email?.toLowerCase() === email) ?? null;
}

async function getOrganizationBySlug(supabase, slug) {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, slug, status")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function countActiveSuperAdmins(supabase) {
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("status", "active");
  if (error) throw error;
  return count ?? 0;
}

async function getProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getMembership(supabase, organizationId, userId) {
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, role, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function plannedUsername(userId, label) {
  return `bootstrap_${label}_${String(userId).slice(0, 8)}`;
}

function profilePayload(user, organizationId, desiredRole) {
  return {
    id: user.id,
    username: plannedUsername(user.id, desiredRole === "super_admin" ? "admin" : desiredRole),
    email: user.email ?? null,
    full_name: null,
    display_name: user.email ?? null,
    role: desiredRole,
    status: "active",
    default_organization_id: organizationId,
  };
}

function membershipPayload(organizationId, userId, role) {
  return {
    organization_id: organizationId,
    user_id: userId,
    role,
    status: "active",
    created_by: null,
  };
}

function addCount(summary, key) {
  summary[key] = (summary[key] ?? 0) + 1;
}

function isDryRunId(value) {
  return typeof value === "string" && value.startsWith("dry-run-");
}

async function ensureOrganization({ supabase, config, executionMode, summary }) {
  const existing = await getOrganizationBySlug(supabase, config.organizationSlug);
  if (existing) {
    addCount(summary, "organizations_existing");
    if (executionMode === "execute") {
      const { error } = await supabase
        .from("organizations")
        .update({
          name: config.organizationName,
          status: "active",
        })
        .eq("id", existing.id);
      if (error) throw error;
      addCount(summary, "organizations_updated");
    } else {
      addCount(summary, "organizations_would_update");
    }
    return existing.id;
  }

  addCount(summary, executionMode === "execute" ? "organizations_created" : "organizations_would_create");
  if (executionMode !== "execute") return "dry-run-organization-id";

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      name: config.organizationName,
      slug: config.organizationSlug,
      status: "active",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function ensureAuthUser({ supabase, userSpec, executionMode, summary }) {
  const existing = await findAuthUserByEmail(supabase, userSpec.email);
  if (existing) {
    addCount(summary, "auth_users_existing");
    return existing;
  }

  addCount(summary, executionMode === "execute" ? "auth_users_created_or_invited" : "auth_users_would_create_or_invite");
  if (executionMode !== "execute") {
    return {
      id: `dry-run-${userSpec.label}-user-id`,
      email: userSpec.email,
    };
  }

  if (userSpec.inviteOnly) {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(userSpec.email, {
      data: {
        bootstrap_role: userSpec.profileRole,
      },
    });
    if (error) throw error;
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: userSpec.email,
    password: userSpec.password,
    email_confirm: true,
    user_metadata: {
      bootstrap_role: userSpec.profileRole,
    },
  });
  if (error) throw error;
  return data.user;
}

async function ensureProfile({ supabase, authUser, organizationId, desiredRole, executionMode, summary }) {
  if (isDryRunId(authUser.id)) {
    addCount(summary, "profiles_would_create");
    return;
  }

  const existing = await getProfile(supabase, authUser.id);
  let nextRole = desiredRole;

  if (existing?.role === "super_admin" && desiredRole !== "super_admin") {
    const activeSuperAdminCount = await countActiveSuperAdmins(supabase);
    if (activeSuperAdminCount <= 1) {
      throw new Error("Refusing to demote the only active super_admin profile.");
    }
    nextRole = "super_admin";
    addCount(summary, "profiles_preserved_super_admin");
  } else if (existing?.role && ADMIN_PROFILE_ROLES.has(existing.role) && desiredRole !== "super_admin") {
    nextRole = existing.role;
    addCount(summary, "profiles_preserved_admin_role");
  }

  if (existing) {
    addCount(summary, "profiles_existing");
  }

  const payload = profilePayload(authUser, organizationId, nextRole);
  if (executionMode !== "execute") {
    addCount(summary, existing ? "profiles_would_update" : "profiles_would_create");
    return;
  }

  const { error } = await supabase.from("profiles").upsert(payload, {
    onConflict: "id",
  });
  if (error) throw error;
  addCount(summary, existing ? "profiles_updated" : "profiles_created");
}

async function ensureMembership({ supabase, organizationId, authUser, role, executionMode, summary }) {
  if (isDryRunId(organizationId) || isDryRunId(authUser.id)) {
    addCount(summary, "organization_members_would_create");
    return;
  }

  const existing = await getMembership(supabase, organizationId, authUser.id);
  if (existing) {
    addCount(summary, "organization_members_existing");
  }

  if (executionMode !== "execute") {
    addCount(summary, existing ? "organization_members_would_update" : "organization_members_would_create");
    return;
  }

  const { error } = await supabase.from("organization_members").upsert(
    membershipPayload(organizationId, authUser.id, role),
    { onConflict: "organization_id,user_id" },
  );
  if (error) throw error;
  addCount(summary, existing ? "organization_members_updated" : "organization_members_created");
}

async function run() {
  const { help, mode } = parseArgs(process.argv.slice(2));
  if (help) {
    printHelp();
    return;
  }

  const config = buildConfig();
  const supabase = createSupabase(config);
  const summary = {
    execution_mode: mode,
    requested_user_count: config.users.length,
  };

  await assertRequiredTables(supabase);
  addCount(summary, "clean_table_checks_passed");

  if (mode === "validate-only") {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const organizationId = await ensureOrganization({
    supabase,
    config,
    executionMode: mode,
    summary,
  });

  for (const userSpec of config.users) {
    const authUser = await ensureAuthUser({
      supabase,
      userSpec,
      executionMode: mode,
      summary,
    });
    await ensureProfile({
      supabase,
      authUser,
      organizationId,
      desiredRole: userSpec.profileRole,
      executionMode: mode,
      summary,
    });
    await ensureMembership({
      supabase,
      organizationId,
      authUser,
      role: userSpec.membershipRole,
      executionMode: mode,
      summary,
    });
  }

  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error("Clean Supabase auth bootstrap failed.");
  if (Array.isArray(error.validationErrors)) {
    for (const validationError of error.validationErrors) {
      console.error(`- ${validationError}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : "Unknown error");
  }
  process.exit(1);
});
