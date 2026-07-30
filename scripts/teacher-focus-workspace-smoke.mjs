import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

const [
  appChrome,
  dialog,
  focusBridge,
  focusLink,
  focusPreview,
  focusShell,
  focusWorkspace,
  nextConfig,
  questionPreviewPage,
  questionImageGallery,
  questionBanks,
  questionsPage,
  reviewPage,
  reviewPreviewPage,
  strictLineageMigration,
  supabaseMiddleware,
] = await Promise.all([
  read("src/components/app-chrome.tsx"),
  read("src/components/ui/dialog.tsx"),
  read("src/components/teacher/focus-workspace-bridge.tsx"),
  read("src/components/teacher/focus-task-link.tsx"),
  read("src/lib/teacher-focus-preview.ts"),
  read("src/components/teacher/focus-workspace-shell.tsx"),
  read("src/lib/teacher-focus-workspace.ts"),
  read("next.config.ts"),
  read(
    "src/app/teacher/banks/[bankId]/questions/[bankQuestionId]/preview/page.tsx",
  ),
  read("src/components/question-detail-image-gallery.tsx"),
  read("src/lib/question-banks.ts"),
  read("src/app/teacher/banks/[bankId]/questions/page.tsx"),
  read("src/app/teacher/banks/[bankId]/review/page.tsx"),
  read("src/app/teacher/banks/[bankId]/review/[reviewItemId]/page.tsx"),
  read("supabase/clean-migrations/0066_strict_bank_review_lineage_gate.sql"),
  read("src/lib/supabase/middleware.ts"),
]);
const { buildFocusHref, sanitizeTeacherBankReturnTo } = await import(
  pathToFileURL(resolve(root, "src/lib/teacher-focus-workspace.ts")).href
);

const returnCases = [
  {
    expected:
      "/teacher/banks/11111111-1111-4111-8111-111111111111/questions?page=2&readiness=archived&source=review_draft&taxonomy=math.course.ap_calculus",
    input:
      "/teacher/banks/11111111-1111-4111-8111-111111111111/questions?q=private+search&page=2&readiness=archived&source=review_draft&taxonomy=math.course.ap_calculus&status=pending_review",
    surface: "questions",
  },
  {
    expected:
      "/teacher/banks/11111111-1111-4111-8111-111111111111/review?page=3&status=needs_more_evidence",
    input:
      "/teacher/banks/11111111-1111-4111-8111-111111111111/review?q=private+search&page=3&status=needs_more_evidence&readiness=archived",
    surface: "review",
  },
  {
    expected:
      "/teacher/banks/11111111-1111-4111-8111-111111111111/questions",
    input:
      "/teacher/banks/22222222-2222-4222-8222-222222222222/questions?readiness=archived",
    surface: "questions",
  },
  {
    expected:
      "/teacher/banks/11111111-1111-4111-8111-111111111111/questions",
    input:
      "/teacher/banks/11111111-1111-4111-8111-111111111111/questions%2Freview?readiness=archived",
    surface: "questions",
  },
];

for (const testCase of returnCases) {
  const actual = sanitizeTeacherBankReturnTo({
    bankId: "11111111-1111-4111-8111-111111111111",
    rawReturnTo: testCase.input,
    surface: testCase.surface,
  });
  assert(actual === testCase.expected, `Unexpected safe return URL: ${actual}`);
  assert(!actual.includes("q="), "Free-text q must never enter a focus return URL.");
}

const focusHref = buildFocusHref({
  href: "/teacher/example/preview?q=private+search",
  returnTo:
    "/teacher/banks/11111111-1111-4111-8111-111111111111/questions",
});
assert(
  !focusHref.includes("q="),
  "Free-text q must be removed from the focused child URL.",
);

assert(
  focusWorkspace.includes("FOCUS_PROTOCOL_SCHEMA_VERSION = 1") &&
    focusWorkspace.includes("isValidFocusLaunchId") &&
    focusWorkspace.includes("FOCUS_LAUNCH_ID_MIN_LENGTH = 32") &&
    focusWorkspace.includes("parsed.searchParams.delete(\"q\")") &&
    focusWorkspace.includes("/%2f|%5c/i") &&
    focusWorkspace.includes("raw.startsWith(\"//\")") &&
    focusWorkspace.includes("parsed.pathname !== expectedPath"),
  "Focus URLs must use a versioned protocol, strong launch IDs, no q, and a normalized same-bank return allowlist.",
);

assert(
  focusLink.includes("crypto.getRandomValues") &&
    focusLink.includes("randomToken(24)") &&
    focusLink.includes('target="_blank"') &&
    focusLink.includes('rel="noopener noreferrer"') &&
    focusLink.includes('referrerPolicy="no-referrer"') &&
    focusLink.includes("Opens in new tab") &&
    focusLink.includes("focus moved to another available task") &&
    focusLink.includes("focus moved to the results") &&
    !focusLink.includes("sessionStorage") &&
    !focusLink.includes("parentLocation") &&
    !focusLink.includes("window.open("),
  "Focus launches must use a real warned anchor, strong launch IDs, accurate fallback focus, no persisted q, and no popup inference.",
);

assert(
  focusBridge.includes("0)") &&
    focusBridge.includes("1_000") &&
    focusBridge.includes("3_000") &&
    focusBridge.includes("5_000") &&
    focusBridge.includes("15_000") &&
    focusBridge.includes("Retry return sync") &&
    focusBridge.includes("window.close()") &&
    focusBridge.includes("Open original list in this tab"),
  "The child handshake must retry ready, time out safely, and retain manual return/close recovery.",
);
assert(
  focusBridge.includes("motion-reduce:animate-none") &&
    questionImageGallery.includes("motion-reduce:transform-none") &&
    questionImageGallery.includes("motion-reduce:transition-none") &&
    dialog.includes("motion-reduce:animate-none") &&
    dialog.includes("motion-reduce:transition-none"),
  "Focused previews and their image dialog must honor reduced-motion preferences.",
);

assert(
  focusShell.includes("Read-only preview") &&
    focusShell.includes('tabIndex={-1}') &&
    focusShell.includes("<h1") &&
    appChrome.includes("isTeacherFocusPathname") &&
    appChrome.includes('className="focus-route-main"'),
  "Focused previews must have a minimal chrome, unique H1/main focus target, and explicit read-only state.",
);

assert(
  nextConfig.match(/Cache-Control/g)?.length === 1 &&
    nextConfig.includes('"private, no-store"') &&
    nextConfig.includes('"no-referrer"') &&
    nextConfig.includes('"noindex, nofollow"') &&
    questionPreviewPage.includes('robots: { follow: false, index: false }') &&
    reviewPreviewPage.includes('robots: { follow: false, index: false }'),
  "All focus preview routes must be no-store, no-referrer, and noindex.",
);
assert(
  supabaseMiddleware.includes("isTeacherFocusRoute") &&
    supabaseMiddleware.includes(
      'response.headers.set("Cache-Control", "private, no-store")',
    ) &&
    supabaseMiddleware.includes(
      'response.headers.set("Referrer-Policy", "no-referrer")',
    ) &&
    supabaseMiddleware.includes(
      'response.headers.set("X-Robots-Tag", "noindex, nofollow")',
    ),
  "Focus middleware must preserve security headers on the final response.",
);

assert(
  focusPreview.startsWith('import "server-only";') &&
    focusPreview.includes("TeacherQuestionPreviewDTO") &&
    focusPreview.includes("ReviewPreviewDTO") &&
    focusPreview.includes("normalizeAnswerSpec") &&
    focusPreview.includes("normalizeQuestionOptions") &&
    focusPreview.includes("A stored validation check needs review.") &&
    !focusPreview.includes("storage_path") &&
    !focusPreview.includes("draft_payload") &&
    !focusPreview.includes("original_filename") &&
    focusPreview.includes("getQuestionAssetUrl(asset.id)") &&
    focusPreview.includes(".eq(\"bank_id\", bankId)") &&
    focusPreview.includes(".eq(\"target_bank_id\", bankId)"),
  "Preview DTO loaders must stay server-only, use field allowlists, and never expose Storage/source payload metadata.",
);

assert(
  questionBanks.includes('.eq("status", "active")') &&
    questionBanks.includes('"active_membership"') &&
    questionBanks.includes('"organization_policy"') &&
    questionBanks.includes('"platform_admin"') &&
    questionBanks.includes("activeMemberRole") &&
    questionBanks.includes("canManage") &&
    focusPreview.includes(
      "typedQuestion.source_review_item_id === reviewItem.id",
    ) &&
    !focusPreview.includes(
      "reviewItem.created_question_id === typedQuestion.id",
    ),
  "Preview access must classify active capabilities and fail closed on incomplete review lineage.",
);

assert(
  questionsPage.includes("FocusTaskLink") &&
    questionsPage.includes("question-preview-") &&
    questionsPage.includes("Open in current tab") &&
    reviewPage.includes("FocusTaskLink") &&
    reviewPage.includes("review-preview-") &&
    reviewPage.includes("Open in current tab"),
  "Question and Review rows must expose warned new-tab previews plus a permanent current-tab fallback.",
);
assert(
  strictLineageMigration.includes(
    "item.id = question_row.source_review_item_id",
  ) &&
    strictLineageMigration.includes(
      "item.created_question_id = question_row.id",
    ) &&
    strictLineageMigration.includes(
      "item.target_bank_id = p_target_bank_id",
    ) &&
    strictLineageMigration.includes(
      "batch.organization_id = question_row.organization_id",
    ) &&
    strictLineageMigration.includes(
      "batch.target_bank_id = p_target_bank_id",
    ) &&
    strictLineageMigration.includes(
      "Review Draft lineage must be linked in both directions before approval.",
    ) &&
    !strictLineageMigration.includes("insert into public.review_draft_items"),
  "The authoritative approval RPC must reject missing or mismatched lineage instead of repairing it during approval.",
);

const mutationTokens = [
  ".insert(",
  ".update(",
  ".delete(",
  "approveBankReviewQuestion",
  "rejectBankReviewDraftQuestion",
];
for (const token of mutationTokens) {
  assert(
    !focusPreview.includes(token),
    `Read-only focus DTO loader unexpectedly contains mutation token: ${token}`,
  );
}

console.log(
  "PASS teacher focus workspace uses safe new-tab coordination and server-projected read-only previews",
);
