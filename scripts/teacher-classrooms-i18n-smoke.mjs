import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const page = await readFile(resolve("src/app/teacher/classrooms/page.tsx"), "utf8");
const messages = await readFile(resolve("src/lib/i18n/messages.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const requiredKeys = [
  "classroom.deliveryLayer",
  "classroom.libraryFirstWorkflow",
  "classroom.title",
  "classroom.rosterSpaces",
  "classroom.classes",
  "classroom.activeStudents",
  "classroom.students",
  "classroom.deliveryEvents",
  "classroom.activeAssignments",
  "classroom.classWork",
  "classroom.allAssignments",
  "classroom.yourClasses",
  "classroom.previewStudentJoin",
  "classroom.openContext",
  "classroom.publishContext",
  "classroom.latestAssignment",
  "classroom.noAssignments",
  "classroom.assignWhenReady",
  "classroom.latestActivity",
  "classroom.joinCode",
  "classroom.open",
  "classroom.assignmentHistory",
  "classroom.noClasses",
  "classroom.noClassesDescription",
  "classroom.openLibraries",
  "classroom.publishRelationship",
  "classroom.publishDescription",
  "classroom.openPublish",
  "classroom.createDescription",
  "classroom.className",
  "classroom.classNamePlaceholder",
  "classroom.sectionSubject",
  "classroom.subjectPlaceholder",
  "classroom.description",
  "classroom.descriptionPlaceholder",
  "classroom.creating",
  "classroom.signedInAs",
  "classroom.statusActive",
  "classroom.statusArchived",
  "classroom.statusUnknown",
  "classroom.assignmentStatusAssigned",
  "classroom.assignmentStatusDraft",
  "classroom.assignmentStatusArchived",
  "classroom.assignmentStatusUnknown",
  "classroom.completionAppearsAfterPractice",
  "classroom.assignedWorkCompleted",
  "classroom.blueprintsPlanned",
  "classroom.notSet",
  "classroom.actionSaved",
  "classroom.actionFailed",
  "classroom.noActivityYet",
  "classroom.classCompletion",
  "classroom.activeWork",
  "classroom.drafts",
  "classroom.deliverySpaceDescription",
];

for (const key of requiredKeys) {
  assert(messages.includes(`"${key}"`), `missing locale key: ${key}`);
  assert(page.includes(`"${key}"`), `classrooms page does not use locale key: ${key}`);
}

assert(
  page.includes("getRequestLocale") &&
    page.includes("formatLocaleDate(locale") &&
    page.includes("formatLocaleDateTime(locale") &&
    page.includes("formatNumber(locale") &&
    !page.includes("formatClassroomDate") &&
    !page.includes("formatClassroomDateTime") &&
    !page.includes("{params.saved}") &&
    !page.includes("{params.error}"),
  "teacher classrooms must use request locale, shared formatters, and safe feedback",
);

for (const invariant of [
  "createClassroom",
  "listTeacherClassroomSummaries",
  'status === "active"',
  'status === "assigned"',
  'status === "draft"',
  'status === "archived"',
  'href={`/teacher/classrooms/${classroom.id}`}',
  'href={`/teacher/classrooms/${classroom.id}/assignments`}',
  'href="/teacher/banks"',
]) {
  assert(page.includes(invariant), `teacher classrooms invariant missing: ${invariant}`);
}

console.log("PASS teacher classrooms i18n source contract");
