import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function readDir(relativePath) {
  return readdir(resolve(root, relativePath));
}

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`export async function ${functionName}`);
  assert(start >= 0, `${functionName} must exist`);
  const nextExport = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, nextExport >= 0 ? nextExport : source.length);
}

const bankActions = await read("src/app/teacher/banks/actions.ts");
const bankReviewPage = await read("src/app/teacher/banks/[bankId]/review/page.tsx");
const questionBanks = await read("src/lib/question-banks.ts");
const smokeAll = await read("scripts/smoke-all.mjs");
const migrationFileNames = [
  ...(await readDir("supabase/clean-migrations")),
];

const editAction = extractFunctionBody(bankActions, "editBankReviewDraftQuestion");
const needsFixAction = extractFunctionBody(
  bankActions,
  "markBankReviewDraftNeedsFix",
);
const rejectAction = extractFunctionBody(
  bankActions,
  "rejectBankReviewDraftQuestion",
);
const approveAction = extractFunctionBody(
  bankActions,
  "approveBankReviewQuestion",
);

assert(
  bankActions.includes("loadManageableBankReviewDraft") &&
    bankActions.includes("await requireTeacher()") &&
    bankActions.includes("getTeacherQuestionBankDetail") &&
    bankActions.includes("canManageBankContent(detail.currentUserRole)") &&
    bankActions.includes('detail.bank.status !== "active"') &&
    bankActions.includes(".eq(\"owner_bank_id\", bankId)") &&
    bankActions.includes(".eq(\"status\", \"draft\")") &&
    bankActions.includes(".is(\"published_at\", null)") &&
    bankActions.includes("draftQuestion.visibility === \"public\""),
  "Review Draft actions must be teacher-authenticated, owner/editor gated, bank-scoped, draft-only, non-published, and non-public",
);

assert(
  editAction.includes("content_source: parsed.contentSource") &&
    editAction.includes("content_source_format: \"markdown_latex\"") &&
    editAction.includes("solution_source: parsed.solutionSource") &&
    editAction.includes("difficulty_rating: parsed.difficultyRating") &&
    editAction.includes("status: \"pending_review\"") &&
    editAction.includes("actionKind: \"edit\"") &&
    !editAction.includes("owner_bank_id:") &&
    !editAction.includes("visibility: \"public\"") &&
    !editAction.includes("published_at: new Date") &&
    !editAction.includes("bank_questions") &&
    !editAction.includes("processAIPdfImport"),
  "edit action must update safe draft content only, reset review item to pending review, and avoid owner/visibility/publish/provider changes",
);

assert(
  needsFixAction.includes("status: \"needs_more_evidence\"") &&
    needsFixAction.includes("actionKind: \"request_more_evidence\"") &&
    needsFixAction.includes("It remains private") &&
    !needsFixAction.includes("status: \"published\"") &&
    !needsFixAction.includes("published_at: new Date") &&
    !needsFixAction.includes("bank_questions") &&
    !needsFixAction.includes("processAIPdfImport"),
  "needs-fix action must use existing review_draft_items needs_more_evidence state without publishing, bank insertion, or provider calls",
);

assert(
  rejectAction.includes("status: \"rejected\"") &&
    rejectAction.includes("status: \"archived\"") &&
    rejectAction.includes("published_at: null") &&
    rejectAction.includes("actionKind: \"reject\"") &&
    rejectAction.includes("question_status_events") &&
    rejectAction.includes("not published, assigned, or added to the Library") &&
    !rejectAction.includes("status: \"published\"") &&
    !rejectAction.includes("published_at: new Date") &&
    !rejectAction.includes("bank_questions") &&
    !rejectAction.includes("processAIPdfImport"),
  "reject action must mark the review item rejected, archive the draft, keep published_at null, and avoid bank insertion/provider calls",
);

assert(
  approveAction.includes('rpc("approve_library_questions_v2"') &&
    approveAction.includes("`/teacher/banks/${parsed.bankId}/review`,") &&
    !approveAction.includes("`/teacher/banks/${parsed.bankId}/questions`,"),
  "approval must keep using the existing bank-scoped RPC and return to the Review Draft page",
);

assert(
  bankReviewPage.includes("Edit Review Draft before approval") &&
    bankReviewPage.includes("Save draft changes") &&
    bankReviewPage.includes("Mark needs fix") &&
    bankReviewPage.includes("Reject and archive") &&
    bankReviewPage.includes("students never") &&
    bankReviewPage.includes("see Review Drafts") &&
    bankReviewPage.includes("Edit changes this private draft only") &&
    bankReviewPage.includes("Reject archives the draft") &&
    bankReviewPage.includes("action={editBankReviewDraftQuestion}") &&
    bankReviewPage.includes("action={markBankReviewDraftNeedsFix}") &&
    bankReviewPage.includes("action={rejectBankReviewDraftQuestion}") &&
    !bankReviewPage.includes("Edit draft - coming next") &&
    !bankReviewPage.includes("Needs fix - coming next") &&
    !bankReviewPage.includes("published_at"),
  "bank Review Draft page must expose edit/needs-fix/reject actions with clear private review-gate copy and no published_at UI",
);

assert(
  questionBanks.includes("content_source") &&
    questionBanks.includes("solution_source") &&
    questionBanks.includes("reviewItemStatus") &&
    questionBanks.includes("review_draft_items") &&
    questionBanks.includes("needs_more_evidence") &&
    questionBanks.includes('question.reviewItemStatus !== "rejected"') &&
    questionBanks.includes('question.reviewItemStatus !== "archived"') &&
    questionBanks.includes(".eq(\"owner_bank_id\", bankId)") &&
    questionBanks.includes(".eq(\"status\", \"draft\")"),
  "bank Review Draft query must carry editable source fields, review status, and filter rejected/archived review items from the normal queue",
);

assert(
  !`${editAction}\n${needsFixAction}\n${rejectAction}`.includes("api_key") &&
    !`${editAction}\n${needsFixAction}\n${rejectAction}`.includes("apiKey") &&
    !`${editAction}\n${needsFixAction}\n${rejectAction}`.includes("service_role") &&
    !bankReviewPage.includes("api_key") &&
    !bankReviewPage.includes("apiKey") &&
    !bankReviewPage.includes("service_role"),
  "Review Draft action MVP must not expose provider or Supabase secrets",
);

assert(
  migrationFileNames.every(
    (fileName) =>
      !fileName.includes("review_draft_actions") &&
      !fileName.includes("review_actions_mvp") &&
      !fileName.includes("needs_fix"),
  ),
  "Review Draft action MVP must not add a migration",
);

assert(
  smokeAll.includes("review-draft-actions-mvp-smoke.mjs"),
  "smoke-all must include Review Draft action MVP smoke",
);

console.log("PASS Review Draft action MVP source smoke");
