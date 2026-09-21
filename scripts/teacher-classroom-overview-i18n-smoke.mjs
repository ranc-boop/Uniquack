import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const page = await readFile(resolve("src/app/teacher/classrooms/[id]/page.tsx"), "utf8");
const messages = await readFile(resolve("src/lib/i18n/messages.ts"), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const key of [
  "classroomOverview.workspace",
  "classroomOverview.descriptionFallback",
  "classroomOverview.reopenInSettings",
  "classroomOverview.backToClasses",
  "classroomOverview.studentsMetricDescription",
  "classroomOverview.activeAssignmentsMetricDescription",
  "classroomOverview.coTeachersMetricDescription",
  "classroomOverview.recentActivityMetricDescription",
  "classroomOverview.activeJoinCode",
  "classroomOverview.joinCodeShareTitle",
  "classroomOverview.joinCodeRosterDescription",
  "classroomOverview.joinCodeStatus",
  "classroomOverview.joiningBlockedArchived",
  "classroomOverview.noActiveJoinCode",
  "classroomOverview.manageJoining",
  "classroomOverview.overview",
  "classroomOverview.deliverySnapshot",
  "classroomOverview.deliverySnapshotDescription",
  "classroomOverview.viewAssignments",
  "classroomOverview.recentAssignments",
  "classroomOverview.recentAssignmentsDescription",
  "classroomOverview.dueItems",
  "classroomOverview.notStarted",
  "classroomOverview.active",
  "classroomOverview.done",
  "classroomOverview.noAssignmentHistory",
  "classroomOverview.noAssignmentHistoryTitle",
  "classroomOverview.noAssignmentHistoryDescription",
  "classroomOverview.reopenBeforePublishing",
  "classroomOverview.studentsNeedingAttention",
  "classroomOverview.attentionProgress",
  "classroomOverview.noAttention",
  "classroomOverview.classTeam",
  "classroomOverview.owner",
  "classroomOverview.activeRosterSummary",
  "classroomOverview.coTeachersSummary",
  "classroomOverview.students",
  "classroomOverview.teachers",
  "classroomOverview.progress",
  "classroomOverview.progressDescription",
  "classroomOverview.openProgress",
  "classroomOverview.linkedBlueprintContext",
  "classroomOverview.noLinkedBlueprints",
  "classroomOverview.linkedBlueprintsDescription",
  "classroomOverview.openBlueprintLibrary",
  "classroomOverview.actionSaved",
  "classroomOverview.actionFailed",
]) {
  assert(messages.includes(`"${key}"`), `missing locale key: ${key}`);
  assert(page.includes(`"${key}"`), `overview page does not use locale key: ${key}`);
}

assert(
  page.includes("getRequestLocale") &&
    page.includes("formatLocaleDate(locale") &&
    page.includes("formatLocaleDateTime(locale") &&
    page.includes("formatNumber(locale") &&
    !page.includes("formatClassroomDate") &&
    !page.includes("formatClassroomDateTime") &&
    !page.includes("{query.saved}") &&
    !page.includes("{query.error}"),
  "classroom overview must use locale-aware display and safe feedback",
);

for (const invariant of [
  "getTeacherClassroomWorkspace",
  'assignment.status === "assigned"',
  'assignment.status === "draft"',
  "studentsNeedingAttention",
  "activeCoTeachers",
  "joinCodeVisible",
  "/assignments/${assignment.id}",
  "/teacher/classrooms/${classroom.id}/students",
  "/teacher/classrooms/${classroom.id}/teachers",
]) {
  assert(page.includes(invariant), `classroom overview invariant missing: ${invariant}`);
}

console.log("PASS teacher classroom overview i18n source contract");
