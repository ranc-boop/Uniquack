import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

const [
  appChrome,
  focusBridge,
  focusLink,
  focusPreview,
  focusShell,
  focusWorkspace,
  nextConfig,
  questionPreviewPage,
  questionsPage,
  reviewPage,
  reviewPreviewPage,
] = await Promise.all([
  read("src/components/app-chrome.tsx"),
  read("src/components/teacher/focus-workspace-bridge.tsx"),
  read("src/components/teacher/focus-task-link.tsx"),
  read("src/lib/teacher-focus-preview.ts"),
  read("src/components/teacher/focus-workspace-shell.tsx"),
  read("src/lib/teacher-focus-workspace.ts"),
  read("next.config.ts"),
  read(
    "src/app/teacher/banks/[bankId]/questions/[bankQuestionId]/preview/page.tsx",
  ),
  read("src/app/teacher/banks/[bankId]/questions/page.tsx"),
  read("src/app/teacher/banks/[bankId]/review/page.tsx"),
  read("src/app/teacher/banks/[bankId]/review/[reviewItemId]/page.tsx"),
]);

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
    !focusLink.includes("window.open("),
  "Focus launches must use a real warned anchor, 192-bit per-launch ID, no referrer, and no window.open popup inference.",
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
  focusPreview.startsWith('import "server-only";') &&
    focusPreview.includes("TeacherQuestionPreviewDTO") &&
    focusPreview.includes("ReviewPreviewDTO") &&
    !focusPreview.includes("storage_path") &&
    !focusPreview.includes("draft_payload") &&
    !focusPreview.includes("original_filename") &&
    focusPreview.includes("getQuestionAssetUrl(asset.id)") &&
    focusPreview.includes(".eq(\"bank_id\", bankId)") &&
    focusPreview.includes(".eq(\"target_bank_id\", bankId)"),
  "Preview DTO loaders must stay server-only, use field allowlists, and never expose Storage/source payload metadata.",
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
