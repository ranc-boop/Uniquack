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

function delegatesToSafeDraftSaver(source) {
  return source.includes("await saveBankReviewDraftQuestion(formData)");
}

function hasReviewDecisionControls(source) {
  return (
    source.includes("/review/${question.reviewItemId}/edit") &&
    source.includes("action={markBankReviewDraftNeedsFix}") &&
    source.includes("action={rejectBankReviewDraftQuestion}") &&
    source.includes("action={approveBankReviewQuestion}")
  );
}

function extractAsyncFunctionBody(source, functionName) {
  const exportedSignature = `export async function ${functionName}`;
  const privateSignature = `async function ${functionName}`;
  const start = source.indexOf(exportedSignature) >= 0
    ? source.indexOf(exportedSignature)
    : source.indexOf(privateSignature);
  assert(start >= 0, `${functionName} must exist`);
  const nextFunction = source.slice(start + 1).search(/\n(?:export\s+)?async function\s+/);
  const end = nextFunction >= 0 ? start + 1 + nextFunction : source.length;
  return source.slice(start, end);
}

const bankActions = await read("src/app/teacher/banks/actions.ts");
const bankReviewPage = await read("src/app/teacher/banks/[bankId]/review/page.tsx");
const questionBanks = await read("src/lib/question-banks.ts");
const smokeAll = await read("scripts/smoke-all.mjs");
const migrationFileNames = [
  ...(await readDir("supabase/clean-migrations")),
];

const saveAction = extractAsyncFunctionBody(bankActions, "saveBankReviewDraftQuestion");
const editAction = extractAsyncFunctionBody(bankActions, "editBankReviewDraftQuestion");
const needsFixAction = extractAsyncFunctionBody(
  bankActions,
  "markBankReviewDraftNeedsFix",
);
const rejectAction = extractAsyncFunctionBody(
  bankActions,
  "rejectBankReviewDraftQuestion",
);
const approveAction = extractAsyncFunctionBody(
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
  delegatesToSafeDraftSaver(editAction) &&
    saveAction.includes("content_source: parsed.contentSource") &&
    saveAction.includes("content_source_format: \"markdown_latex\"") &&
    saveAction.includes("solution_source: parsed.solutionSource") &&
    saveAction.includes("difficulty_rating: parsed.difficultyRating") &&
    saveAction.includes("status: \"pending_review\"") &&
    saveAction.includes("actionKind: \"edit\"") &&
    !`${saveAction}\n${editAction}`.includes("owner_bank_id:") &&
    !`${saveAction}\n${editAction}`.includes("visibility: \"public\"") &&
    !`${saveAction}\n${editAction}`.includes("published_at: new Date") &&
    !`${saveAction}\n${editAction}`.includes("bank_questions") &&
    !`${saveAction}\n${editAction}`.includes("processAIPdfImport"),
  "edit action must delegate to the safe draft saver, reset Review state, and avoid owner/visibility/publish/provider changes",
);

assert(
  !delegatesToSafeDraftSaver(
    editAction.replace(
      "await saveBankReviewDraftQuestion(formData)",
      "await unsafeSave(formData)",
    ),
  ),
  "Review edit delegation mutation must be detectable.",
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
  hasReviewDecisionControls(bankReviewPage) &&
    bankReviewPage.includes("Approval confirms these questions for this Library") &&
    bankReviewPage.includes("Content") &&
    bankReviewPage.includes("you did not preview remains your responsibility") &&
    !bankReviewPage.includes("Edit draft - coming next") &&
    !bankReviewPage.includes("Needs fix - coming next") &&
    !bankReviewPage.includes("published_at"),
  "bank Review Draft page must expose edit/needs-fix/reject/approve controls with manual review-gate context and no published_at UI",
);

assert(
  !hasReviewDecisionControls(
    bankReviewPage.replace(
      "action={rejectBankReviewDraftQuestion}",
      "action={approveBankReviewQuestion}",
    ),
  ),
  "Removing the Review rejection action must fail the decision-control contract.",
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
