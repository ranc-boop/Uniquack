import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const page = await readFile(
  resolve("src/app/teacher/classrooms/[id]/students/page.tsx"),
  "utf8",
);
const messages = await readFile(resolve("src/lib/i18n/messages.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const requiredKeys = [
  "classroomStudents.title",
  "classroomStudents.description",
  "classroomStudents.backToOverview",
  "classroomStudents.needsAttention",
  "classroomStudents.joined",
  "classroomStudents.latestAssignmentActivity",
  "classroomStudents.assigned",
  "classroomStudents.completed",
  "classroomStudents.practice",
  "classroomStudents.removeConfirmation",
  "classroomStudents.removing",
  "classroomStudents.removeFromActiveRoster",
  "classroomStudents.restoring",
  "classroomStudents.restoreToActiveRoster",
  "classroomStudents.reopenBeforeRestore",
  "classroomStudents.activeStudentsDescription",
  "classroomStudents.needAttentionDescription",
  "classroomStudents.removedDescription",
  "classroomStudents.assignedWorkDescription",
  "classroomStudents.studentRoster",
  "classroomStudents.rosterDescription",
  "classroomStudents.noStudentsYet",
  "classroomStudents.noStudentsTitle",
  "classroomStudents.noStudentsDescription",
  "classroomStudents.manageJoinCode",
  "classroomStudents.statusActive",
  "classroomStudents.statusRemoved",
  "classroomStudents.noActivityYet",
  "classroomStudents.actionSaved",
  "classroomStudents.actionFailed",
];

for (const key of requiredKeys) {
  assert(messages.includes(`"${key}"`), `missing locale key: ${key}`);
  assert(page.includes(`"${key}"`), `students page does not use locale key: ${key}`);
}

assert(
  page.includes("getRequestLocale") &&
    page.includes("formatLocaleDateTime(locale") &&
    page.includes("formatNumber(locale") &&
    !page.includes("formatClassroomDateTime") &&
    !page.includes("{query.saved}") &&
    !page.includes("{query.error}"),
  "student roster must use request locale, shared formatters, and safe feedback",
);

for (const invariant of [
  "removeClassroomStudent",
  "restoreClassroomStudent",
  'name="confirmRemoval"',
  'name="memberId"',
  'member.status === "removed"',
  'member.status === "active"',
  "assignmentSummary",
  "linkedPracticeSessionCount",
  "rosterDescription",
]) {
  assert(page.includes(invariant), `student roster invariant missing: ${invariant}`);
}

assert(
  messages.includes("source Library membership") &&
    messages.includes("题库成员资格"),
  "student roster copy must preserve the source Library membership boundary",
);

console.log("PASS teacher classroom students i18n source contract");
