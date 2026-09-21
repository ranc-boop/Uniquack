import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const page = await readFile(
  resolve(root, "src/app/teacher/course-builder/page.tsx"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function usesMessageKeys(source, ...keys) {
  return keys.every((key) => source.includes(`"${key}"`));
}

assert(
  page.includes("getRequestLocale") &&
    page.includes("formatDateTime(locale") &&
    page.includes("formatNumber(locale") &&
    usesMessageKeys(
      page,
      "courseBuilder.title",
      "courseBuilder.courseBuilderRun",
      "courseBuilder.practiceFramework",
      "courseBuilder.sourceStatusActive",
      "courseBuilder.sourceStatusDraft",
      "courseBuilder.sourceReadyForReview",
      "courseBuilder.published",
      "courseBuilder.needsReview",
      "courseBuilder.assignablePublishedQuestions",
      "courseBuilder.questionTypeMcq",
      "courseBuilder.questionTypeFillBlank",
      "courseBuilder.questionTypeFrq",
      "courseBuilder.questionTypeMixed",
      "courseBuilder.draftsUnavailableForAssignment",
      "courseBuilder.libraryReview",
      "courseBuilder.toApproveBeforeAssigning",
      "courseBuilder.classroom",
      "courseBuilder.chooseClassroom",
      "courseBuilder.assignmentTitle",
      "courseBuilder.instructions",
      "courseBuilder.defaultAssignmentTitle",
      "courseBuilder.defaultAssignmentInstructions",
      "courseBuilder.dueDate",
      "courseBuilder.saveDraftTeacherOnly",
      "courseBuilder.assignNowVisible",
      "courseBuilder.creatingAssignment",
      "courseBuilder.deliveryClassroomRequired",
      "courseBuilder.noSourcesAvailable",
    ),
  "Course Builder must localize its teacher-only assignment bridge without changing source data",
);

console.log("PASS Course Builder i18n source contract");
