import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const page = await readFile(resolve(root, "src/app/teacher/classrooms/[id]/assignments/[assignmentId]/page.tsx"), "utf8");
const messages = await readFile(resolve(root, "src/lib/i18n/messages.ts"), "utf8");
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
assert(page.includes("getRequestLocale") && page.includes("formatLocaleDateTime") && page.includes("formatNumber"), "locale helpers required");
assert(!page.includes("{query.saved}") && !page.includes("{query.error}"), "raw query feedback forbidden");
assert(
  page.includes("getAssignmentDeliveryQuarantine") &&
    page.includes('"assignmentDetail.evidenceDescription"') &&
    messages.includes("Private student self-study is not included."),
  "evidence/review gate invariant missing",
);
for (const key of [
  "assignmentDetail.actionSaved",
  "assignmentDetail.actionFailed",
  "assignmentDetail.library",
  "assignmentDetail.needsReview",
  "assignmentDetail.detailEyebrow",
  "assignmentDetail.deliveryDetailFor",
  "assignmentDetail.teacherStudio",
  "assignmentDetail.backToAssignments",
  "assignmentDetail.previewAsStudent",
  "assignmentDetail.openStudentPreview",
  "assignmentDetail.evidenceEyebrow",
  "assignmentDetail.evidenceHeading",
  "assignmentDetail.evidenceDescription",
  "assignmentDetail.studentsCompleted",
  "assignmentDetail.completionRate",
  "assignmentDetail.attempts",
  "assignmentDetail.correctMissed",
  "assignmentDetail.studentsNeedingAttention",
  "assignmentDetail.twoOrMoreAttempts",
  "assignmentDetail.deliveryPausedByReview",
  "assignmentDetail.quarantineDescription",
  "assignmentDetail.pausedAtReview",
  "assignmentDetail.openLibraryReview",
  "assignmentDetail.resumingDelivery",
  "assignmentDetail.resumeDelivery",
  "assignmentDetail.createReplacementAssignment",
  "assignmentDetail.unavailableLibraryQuestion",
  "assignmentDetail.resumeOnlyAfterIssues",
  "assignmentDetail.useLibraryReview",
  "assignmentDetail.replacementWhenCannotRepair",
  "assignmentDetail.draftTeacherOnly",
  "assignmentDetail.draftDescription",
  "assignmentDetail.assignedVisible",
  "assignmentDetail.assignedDescription",
  "assignmentDetail.studentProgress",
  "assignmentDetail.studentProgressDescription",
  "assignmentDetail.noActiveStudents",
  "assignmentDetail.addStudentsForProgress",
  "assignmentDetail.noLinkedPracticeEvidence",
  "assignmentDetail.studentsOrderedByAttention",
  "assignmentDetail.student",
  "assignmentDetail.status",
  "assignmentDetail.correctTotal",
  "assignmentDetail.latestActivity",
  "assignmentDetail.viewEvidence",
  "assignmentDetail.pending",
  "assignmentDetail.hintsUsed",
  "assignmentDetail.missed",
  "assignmentDetail.linkedSessions",
  "assignmentDetail.attemptSummary",
  "assignmentDetail.gradingMode",
  "assignmentDetail.evidencePending",
  "assignmentDetail.questionPerformance",
  "assignmentDetail.optionalEvidenceByQuestion",
  "assignmentDetail.questionPerformanceLabel",
  "assignmentDetail.question",
  "assignmentDetail.typeDifficulty",
  "assignmentDetail.attempted",
  "assignmentDetail.missedCount",
  "assignmentDetail.attentionSignal",
  "assignmentDetail.difficulty",
  "assignmentDetail.notAvailable",
  "assignmentDetail.noSelectedQuestions",
  "assignmentDetail.addQuestionsBeforeAssigning",
  "assignmentDetail.attemptDrilldown",
  "assignmentDetail.optionalRecentEvidence",
  "assignmentDetail.viewRecentAttempts",
  "assignmentDetail.studentAnswer",
  "assignmentDetail.systemReview",
  "assignmentDetail.noWrittenReview",
  "assignmentDetail.evidenceStillPending",
  "assignmentDetail.practiceEvidenceAppearsHere",
  "assignmentDetail.correctInAssignmentPractice",
]) assert(messages.includes(`\"${key}\"`), `missing ${key}`);
for (const key of [
  "studentProgress",
  "studentProgressDescription",
  "questionPerformance",
  "attemptDrilldown",
  "viewRecentAttempts",
  "studentAnswer",
  "systemReview",
  "correctInAssignmentPractice",
]) assert(page.includes(`assignmentDetail.${key}`), `page must use assignmentDetail.${key}`);
assert(
  !page.includes("correct in assignment-linked Practice") &&
    page.includes("courseBuilder.questionTypeFillBlank"),
  "assignment detail must localize progress summaries and known question types",
);
assert(page.includes("assignmentId") && page.includes("studentProgressRows"), "assignment-linked evidence isolation must remain present");
assert(!page.includes("{query.saved}") && !page.includes("{query.error}"), "detail page must not render raw query feedback");
for (const key of ["teacherFeedbackNotes", "respondToAssignmentEvidence", "feedbackNote", "savePrivateNote", "sendToStudent", "assignmentItems", "assignmentSetupAndSource", "studentAccess", "assignmentOnlyLibraryPrivate", "openSourceLibrary"]) assert(messages.includes(`\"assignmentDetail.${key}\"`), `missing assignmentDetail.${key}`);
assert(page.includes("savePrivateTeacherFeedbackNote") && page.includes("sendTeacherFeedbackNote"), "feedback actions missing");
for (const field of ["assignmentId", "classroomId", "feedbackId", "studentId", "body", "questionId", "practiceAttemptId"]) assert(page.includes(`name=\"${field}\"`), `form field changed: ${field}`);
console.log("PASS teacher assignment detail i18n source contract");
