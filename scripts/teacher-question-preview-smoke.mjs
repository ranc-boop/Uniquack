import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [
  previewRoute,
  lazyPreview,
  preview,
  previewTypes,
  previewLoader,
  reviewPage,
  questionPage,
  publishPage,
  blueprintPage,
  assignmentSummary,
  teacherPublish,
  reviewActions,
  validation,
  reviewBulkPage,
  questionBulkPage,
  previewQueue,
] = await Promise.all([
  read("src/app/api/teacher/banks/[bankId]/previews/route.ts"),
  read("src/components/teacher/lazy-teacher-question-preview.tsx"),
  read("src/components/teacher/teacher-question-preview.tsx"),
  read("src/lib/teacher-question-preview-types.ts"),
  read("src/lib/teacher-focus-preview.ts"),
  read("src/app/teacher/banks/[bankId]/review/page.tsx"),
  read("src/app/teacher/banks/[bankId]/questions/page.tsx"),
  read("src/app/teacher/publish/page.tsx"),
  read("src/app/teacher/blueprints/new/page.tsx"),
  read("src/components/teacher/assignment-selection-summary.tsx"),
  read("src/lib/teacher-publish.ts"),
  read("src/app/teacher/banks/actions.ts"),
  read("src/lib/questions/review-publish-validation.ts"),
  read("src/app/teacher/banks/[bankId]/review/bulk/page.tsx"),
  read("src/app/teacher/banks/[bankId]/questions/preview/page.tsx"),
  read("src/components/teacher/teacher-question-preview-queue.tsx"),
]);

assert(
  previewRoute.includes("resolveTrustedPostOrigin") &&
    previewRoute.includes("canAccessTeacher") &&
    previewRoute.includes("ids.length > 5") &&
    previewRoute.includes('"Cache-Control": "private, no-store"') &&
    previewRoute.includes("getTeacherQuestionPreviewDTOs") &&
    previewRoute.includes("getReviewPreviewDTOs") &&
    previewRoute.includes("getPublicQuestionPreviewDTOs"),
  "preview API must be same-origin, teacher-only, bank-scoped, private, and bounded",
);

assert(
  previewTypes.includes('"assignment-selection"') &&
    previewTypes.includes('"public-question"') &&
    previewTypes.includes('"question"') &&
    previewTypes.includes('"review"') &&
    previewLoader.includes('.eq("target_bank_id", bankId)') &&
    previewLoader.includes("if (!access?.canManage) return null") &&
    previewLoader.includes('.eq("owner_bank_id", bankId)') &&
    previewLoader.includes('.eq("status", "published")') &&
    previewLoader.includes('.eq("visibility", "public")'),
  "all preview kinds must enforce exact Library or public-question ownership",
);

assert(
  reviewBulkPage.includes("getTeacherQuestionBankAccess") &&
    reviewBulkPage.includes("if (!access?.canManage) notFound()") &&
    questionBulkPage.includes("getTeacherQuestionBankAccess") &&
    reviewBulkPage.includes('kind="review"') &&
    questionBulkPage.includes('kind="question"') &&
    !reviewBulkPage.includes("getReviewPreviewDTOs") &&
    !questionBulkPage.includes("getTeacherQuestionPreviewDTOs") &&
    previewQueue.includes("ids.slice(currentIndex, currentIndex + 2)") &&
    previewQueue.includes("versionsRef") &&
    previewQueue.includes("bypassUnversionedCache: true") &&
    previewQueue.includes("loadTeacherQuestionPreviews") &&
    previewQueue.includes("controller.abort()"),
  "selected preview queues must authorize before rendering and load only the current plus next question",
);

assert(
  lazyPreview.includes("activeRequestCount < 2") &&
    lazyPreview.includes("previewCache") &&
    lazyPreview.includes("MAX_PREVIEW_CACHE_ENTRIES = 50") &&
    lazyPreview.includes("previewCache.size > MAX_PREVIEW_CACHE_ENTRIES") &&
    lazyPreview.includes("bypassUnversionedCache") &&
    lazyPreview.includes("getCachedPreview") &&
    lazyPreview.includes("setCachedPreview") &&
    lazyPreview.includes("AbortController") &&
    lazyPreview.includes("loadingRef.current") &&
    lazyPreview.includes("abortRef.current === controller") &&
    lazyPreview.includes('cache: "no-store"') &&
    lazyPreview.includes("Retry") &&
    lazyPreview.includes("aria-expanded={expanded}") &&
    lazyPreview.includes("aria-controls={panelId}"),
  "lazy preview must bound concurrency, cache by version, abort, retry, and expose disclosure semantics",
);

assert(
  preview.includes("QuestionText") &&
    preview.includes("QuestionDetailImageGallery") &&
    preview.includes("normalizeQuestionOptions") &&
    preview.includes("Correct answer") &&
    preview.includes("Solution") &&
    preview.includes("<summary") &&
    preview.includes("Details") &&
    !preview.includes("Expand all"),
  "compact preview must expose the complete question without nested multi-step disclosure",
);

assert(
    validation.includes("hardErrors") &&
    validation.includes("softWarnings") &&
    validation.includes("Question content is required") &&
    validation.includes("readiness.blockingReasons") &&
    reviewActions.includes("assertBankReviewQuestionsPublishable") &&
    reviewActions.includes("approveCurrentBankReviewPage") &&
    reviewPage.includes('t("teacherLibrary.approveCurrentPage"') &&
    reviewPage.includes("blockedCount") &&
    reviewPage.includes('t("teacherLibrary.approve"') &&
    !reviewPage.includes("Skip") &&
    !reviewPage.includes("Expand all"),
  "Review must block hard errors and keep one explicit approval action per question",
);

assert(
  questionPage.includes('kind="question"') &&
    questionPage.includes('kind="public-question"') &&
    questionPage.includes(
      "version={row.question?.updated_at ?? row.added_at}",
    ) &&
    publishPage.includes('kind="assignment-selection"') &&
    publishPage.includes("version={question.updated_at}") &&
    reviewPage.includes("version={question.updatedAt}") &&
    blueprintPage.includes('kind="question"') &&
    assignmentSummary.includes('t("assignment.previewSelected")') &&
    assignmentSummary.includes("nextPreviewId") &&
    assignmentSummary.includes("loadTeacherQuestionPreviews"),
  "every question picker must share inline and selected-item previews with next-item prefetch",
);

assert(
  !teacherPublish.includes("promptPreview") &&
    !teacherPublish.includes("tagSummaries") &&
    !teacherPublish.includes("question_taxonomy_assignments") &&
    !teacherPublish.includes("htmlToPlainTextExcerpt") &&
    !teacherPublish.includes("content_html"),
  "assignment selection must keep its initial query summary-only and defer full content to preview",
);

assert(
  !reviewPage.toLowerCase().includes("revision draft") &&
    !questionPage.toLowerCase().includes("revision draft") &&
    !publishPage.toLowerCase().includes("revision draft") &&
    reviewActions.includes("Draft changes could not be created.") &&
    reviewActions.includes("publishBankReviewDraftChanges"),
  "technical revision mechanics must stay hidden behind Draft changes and Publish changes",
);

console.log("PASS teacher approval and lazy complete preview contract");
