import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const env = loadEnv(resolve(process.cwd(), ".env.test"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.CI_AUTHZ_PASSWORD;
if (!url || !serviceKey || !password) throw new Error("Missing local CI authorization configuration.");
if (!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/.test(url)) throw new Error(`Refusing non-local target: ${url}`);

const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const t1 = env.TEST_ORG_T1;
const t2 = env.TEST_ORG_T2;
const accounts = [
  { email: env.TEST_STUDENT_USERNAME, username: "student_t1", role: "student", memberRole: "student", org: t1 },
  { email: env.TEST_TEACHER_USERNAME, username: "teacher_a_t1", role: "teacher", memberRole: "teacher", org: t1 },
  { email: env.TEST_TEACHER_B_USERNAME, username: "teacher_b_t1", role: "teacher", memberRole: "teacher", org: t1 },
  { email: env.TEST_UNRELATED_TEACHER_USERNAME, username: "teacher_t2", role: "teacher", memberRole: "teacher", org: t2 },
  { email: env.TEST_ADMIN_USERNAME, username: "admin_t1", role: "admin", memberRole: "admin", org: t1 },
  { email: env.TEST_SUPER_ADMIN_USERNAME, username: "super_admin_t1", role: "super_admin", memberRole: "admin", org: t1 },
];

const orgResult = await service.from("organizations").upsert([
  { id: t1, name: "EduStruct T1 Disposable", slug: "edustruct-t1-ci", status: "active" },
  { id: t2, name: "EduStruct T2 Disposable", slug: "edustruct-t2-ci", status: "active" },
], { onConflict: "id" });
if (orgResult.error) throw orgResult.error;

async function findUser(email) {
  const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((user) => user.email === email) ?? null;
}

for (const account of accounts) {
  let user = await findUser(account.email);
  if (user) {
    const result = await service.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (result.error) throw result.error;
  } else {
    const result = await service.auth.admin.createUser({ email: account.email, password, email_confirm: true });
    if (result.error || !result.data.user) throw result.error ?? new Error(`Failed to create ${account.email}`);
    user = result.data.user;
  }
  const profile = await service.from("profiles").upsert({
    id: user.id, username: account.username, email: account.email, full_name: account.username,
    role: account.role, status: "active", default_organization_id: account.org,
  }, { onConflict: "id" });
  if (profile.error) throw profile.error;
  const membership = await service.from("organization_members").upsert({
    organization_id: account.org, user_id: user.id, role: account.memberRole, status: "active",
  }, { onConflict: "organization_id,user_id" });
  if (membership.error) throw membership.error;
}
console.log("PASS seeded disposable authorization actors");
