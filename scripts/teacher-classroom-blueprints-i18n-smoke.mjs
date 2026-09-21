import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const page = await readFile(resolve("src/app/teacher/classrooms/[id]/blueprints/page.tsx"), "utf8");
const messages = await readFile(resolve("src/lib/i18n/messages.ts"), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const key of [
  "classroomBlueprints.title",
  "classroomBlueprints.openLibrary",
  "classroomBlueprints.description",
  "classroomBlueprints.linkedDescription",
  "classroomBlueprints.linked",
  "classroomBlueprints.libraryAssignmentsDescription",
  "classroomBlueprints.libraryAssignments",
  "classroomBlueprints.allAssignmentsDescription",
  "classroomBlueprints.planningContext",
  "classroomBlueprints.planningDescription",
  "classroomBlueprints.selectedItems",
  "classroomBlueprints.openAssignment",
  "classroomBlueprints.noLinked",
  "classroomBlueprints.noLinkedTitle",
  "classroomBlueprints.noLinkedDescription",
]) {
  assert(messages.includes(`"${key}"`), `missing locale key: ${key}`);
  assert(page.includes(`"${key}"`), `blueprints page does not use locale key: ${key}`);
}

assert(
  page.includes("getRequestLocale") &&
    page.includes("formatNumber(locale") &&
    !page.includes("sourceKindLabel") &&
    page.includes('assignment.source_kind === "question_bank"'),
  "classroom blueprints must localize counts and preserve bank-linked filtering",
);

for (const invariant of [
  "getTeacherClassroomWorkspace",
  "source_kind",
  "assignment.itemCount",
  "/assignments/${assignment.id}",
  "noLinkedDescription",
]) {
  assert(page.includes(invariant), `classroom blueprints invariant missing: ${invariant}`);
}

assert(
  messages.includes("source Libraries") && messages.includes("源题库"),
  "classroom blueprints copy must preserve source Library privacy boundary",
);

console.log("PASS teacher classroom blueprints i18n source contract");
