import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const page = await readFile(resolve("src/app/teacher/classrooms/[id]/teachers/page.tsx"), "utf8");
const messages = await readFile(resolve("src/lib/i18n/messages.ts"), "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const key of [
  "classroomTeachers.title",
  "classroomTeachers.description",
  "classroomTeachers.backToOverview",
  "classroomTeachers.owner",
  "classroomTeachers.coTeacher",
  "classroomTeachers.active",
  "classroomTeachers.removed",
  "classroomTeachers.added",
  "classroomTeachers.removeConfirmation",
  "classroomTeachers.removing",
  "classroomTeachers.removeCoTeacher",
  "classroomTeachers.ownerMetricDescription",
  "classroomTeachers.activeMetricDescription",
  "classroomTeachers.removedMetricDescription",
  "classroomTeachers.teamTitle",
  "classroomTeachers.teamDescription",
  "classroomTeachers.noMembership",
  "classroomTeachers.addTitle",
  "classroomTeachers.addDescription",
  "classroomTeachers.lookupLabel",
  "classroomTeachers.lookupPlaceholder",
  "classroomTeachers.adding",
  "classroomTeachers.addCoTeacher",
  "classroomTeachers.ownerOnly",
  "classroomTeachers.actionSaved",
  "classroomTeachers.actionFailed",
]) {
  assert(messages.includes(`"${key}"`), `missing locale key: ${key}`);
  assert(page.includes(`"${key}"`), `teachers page does not use locale key: ${key}`);
}

assert(
  page.includes("getRequestLocale") &&
    page.includes("formatLocaleDateTime(locale") &&
    page.includes("formatNumber(locale") &&
    !page.includes("formatClassroomDateTime") &&
    !page.includes("{query.saved}") &&
    !page.includes("{query.error}"),
  "classroom teachers must use locale-aware display and safe feedback",
);

for (const invariant of [
  "addClassroomCoTeacher",
  "removeClassroomCoTeacher",
  'name="confirmRemoval"',
  'name="memberId"',
  'member.role === "co_teacher"',
  'member.status === "active"',
  'member.status === "removed"',
  "teamDescription",
]) {
  assert(page.includes(invariant), `classroom teachers invariant missing: ${invariant}`);
}

assert(
  messages.includes("source Libraries") && messages.includes("源题库"),
  "classroom teachers copy must preserve separate Library membership boundary",
);

console.log("PASS teacher classroom teachers i18n source contract");
