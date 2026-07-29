import { readFile } from "node:fs/promises";

const [migration, questionBanks, importsPage] = await Promise.all([
  readFile(
    new URL(
      "../supabase/clean-migrations/0062_teacher_bank_import_workspace_read_model.sql",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(new URL("../src/lib/question-banks.ts", import.meta.url), "utf8"),
  readFile(
    new URL(
      "../src/app/teacher/banks/[bankId]/imports/page.tsx",
      import.meta.url,
    ),
    "utf8",
  ),
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  migration.includes("get_teacher_bank_import_workspace_v1") &&
    migration.includes("security invoker") &&
    migration.includes("(select auth.uid())") &&
    migration.includes("limit 25") &&
    migration.includes("grant execute") &&
    !migration.includes("security definer"),
  "Teacher import read model must be bounded, current-user scoped, and SECURITY INVOKER.",
);

assert(
  questionBanks.includes(
    'rpc("get_teacher_bank_import_workspace_v1",',
  ) &&
    questionBanks.includes("isMissingBankImportWorkspaceRpc") &&
    questionBanks.includes("const [access, importBatches] = await Promise.all(["),
  "Teacher import workspace loader must prefer one RPC and keep a parallel pre-migration fallback.",
);

assert(
  importsPage.includes("getTeacherBankImportWorkspace({") &&
    importsPage.includes("const profilePromise = requireTeacher()") &&
    importsPage.includes("resolveProfileId: async () => (await profilePromise).id") &&
    importsPage.includes("const importBatches = importWorkspace.importBatches") &&
    !importsPage.includes("listBankImportBatches({"),
  "Teacher import page must consume the combined access and recent-import read model.",
);

console.log("PASS teacher import workspace uses one bounded RLS-preserving read model");
