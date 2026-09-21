import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const page = await readFile(
  resolve(root, "src/app/teacher/classrooms/[id]/assignments/page.tsx"),
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
    page.includes("formatLocaleDate(locale") &&
    page.includes("formatLocaleDateTime(locale") &&
    page.includes("formatNumber(locale") &&
    usesMessageKeys(
      page,
      "assignments.deliveryPaused",
      "assignments.assigned",
      "assignments.draft",
      "assignments.archived",
      "assignments.deliveryHistoryDescription",
      "assignments.assignmentVisibility",
      "assignments.assignmentVisibilityDescription",
      "assignments.archivedClassroomNotice",
      "assignments.publishToClasses",
      "assignments.actionSaved",
      "assignments.actionFailed",
    ) &&
    !page.includes("{query.saved}") &&
    !page.includes("{query.error}"),
  "Teacher classroom assignments must localize UI feedback without reflecting raw query values",
);

assert(
  page.includes("getManagedClassroom") &&
    page.includes("listTeacherClassroomAssignments") &&
    page.includes("getAssignmentDeliveryQuarantine") &&
    page.includes('assignment.status === "assigned"') &&
    page.includes('assignment.status === "draft"') &&
    page.includes('assignment.status === "archived"') &&
    page.includes("Assignment visibility") === false,
  "Teacher classroom assignments must retain delivery states and assignment-only visibility controls",
);

console.log("PASS teacher classroom assignments i18n source contract");
