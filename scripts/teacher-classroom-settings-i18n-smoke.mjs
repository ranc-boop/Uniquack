import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const page = await readFile(resolve("src/app/teacher/classrooms/[id]/settings/page.tsx"), "utf8");
const messages = await readFile(resolve("src/lib/i18n/messages.ts"), "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const key of [
  "classroomSettings.title",
  "classroomSettings.description",
  "classroomSettings.backToOverview",
  "classroomSettings.statusDescription",
  "classroomSettings.status",
  "classroomSettings.joinCodeDescription",
  "classroomSettings.joinCode",
  "classroomSettings.recentActivity",
  "classroomSettings.classIdentity",
  "classroomSettings.identityDescription",
  "classroomSettings.className",
  "classroomSettings.subjectSection",
  "classroomSettings.descriptionLabel",
  "classroomSettings.created",
  "classroomSettings.updated",
  "classroomSettings.saving",
  "classroomSettings.save",
  "classroomSettings.joinCodeLifecycle",
  "classroomSettings.joinCodeLifecycleDescription",
  "classroomSettings.joiningArchived",
  "classroomSettings.joiningDisabled",
  "classroomSettings.rotating",
  "classroomSettings.rotate",
  "classroomSettings.disabling",
  "classroomSettings.disable",
  "classroomSettings.enabling",
  "classroomSettings.enable",
  "classroomSettings.lastJoinCodeChange",
  "classroomSettings.lifecycle",
  "classroomSettings.lifecycleDescription",
  "classroomSettings.archiveConfirmation",
  "classroomSettings.archiving",
  "classroomSettings.archive",
  "classroomSettings.reopening",
  "classroomSettings.reopen",
  "classroomSettings.actionSaved",
  "classroomSettings.actionFailed",
]) {
  assert(messages.includes(`"${key}"`), `missing locale key: ${key}`);
  assert(page.includes(`"${key}"`), `settings page does not use locale key: ${key}`);
}

assert(
  page.includes("getRequestLocale") &&
    page.includes("formatLocaleDateTime(locale") &&
    !page.includes("formatClassroomDateTime") &&
    !page.includes("{query.saved}") &&
    !page.includes("{query.error}"),
  "classroom settings must use locale-aware display and safe feedback",
);

for (const invariant of [
  "archiveClassroom",
  "reopenClassroom",
  "createClassroomJoinCode",
  "rotateClassroomJoinCode",
  "disableClassroomJoining",
  'name="confirmArchive"',
  'name="classroomId"',
  'classroom.status === "active"',
  'classroom.status === "archived"',
  "lifecycleDescription",
]) {
  assert(page.includes(invariant), `classroom settings invariant missing: ${invariant}`);
}

assert(
  messages.includes("does not delete assignments") && messages.includes("不会删除作业"),
  "classroom lifecycle copy must preserve deletion boundary",
);

console.log("PASS teacher classroom settings i18n source contract");
