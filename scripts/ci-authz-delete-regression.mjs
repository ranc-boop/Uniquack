import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(resolve(".env.test"), "utf8").split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean)
    .map((match) => [match[1], match[2]]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!/^http:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/.test(url ?? "")) throw new Error("Delete regression requires local Supabase.");
const service = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(url, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const signIn = await admin.auth.signInWithPassword({ email: env.TEST_ADMIN_USERNAME, password: env.TEST_ADMIN_PASSWORD });
if (signIn.error) throw signIn.error;

async function createOrphan(org, label) {
  const result = await service.from("questions").insert({
    organization_id: org,
    owner_bank_id: null,
    question_code: `CI-DELETE-${label}-${randomUUID().slice(0, 8)}`,
    title: `CI delete regression ${label}`,
    question_type: "mcq",
    content_html: "<p>x</p>",
    status: "draft",
  }).select("id").single();
  if (result.error) throw result.error;
  return result.data.id;
}

const ownId = await createOrphan(env.TEST_ORG_T1, "own");
const foreignId = await createOrphan(env.TEST_ORG_T2, "foreign");
try {
  const ownDelete = await admin.from("questions").delete().eq("id", ownId);
  if (ownDelete.error) throw ownDelete.error;
  const ownAfter = await service.from("questions").select("id").eq("id", ownId).maybeSingle();
  if (ownAfter.error || ownAfter.data) throw new Error("Control failed: T1 admin could not delete a T1 orphan question.");
  const foreignDelete = await admin.from("questions").delete().eq("id", foreignId);
  if (foreignDelete.error) throw foreignDelete.error;
  const foreignAfter = await service.from("questions").select("id").eq("id", foreignId).maybeSingle();
  if (foreignAfter.error || !foreignAfter.data) throw new Error("F-001 regression: T1 admin deleted a T2 orphan question.");
  console.log("PASS orphan-question DELETE is organization scoped");
} finally {
  await service.from("questions").delete().in("id", [ownId, foreignId]);
}
