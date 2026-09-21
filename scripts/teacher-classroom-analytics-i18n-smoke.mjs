import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const page = await readFile(resolve("src/app/teacher/classrooms/[id]/analytics/page.tsx"), "utf8");
const messages = await readFile(resolve("src/lib/i18n/messages.ts"), "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

for (const key of [
  "classroomAnalytics.title",
  "classroomAnalytics.description",
  "classroomAnalytics.allProgress",
  "classroomAnalytics.backToOverview",
  "classroomAnalytics.assignedDescription",
  "classroomAnalytics.practiceLinks",
  "classroomAnalytics.practiceLinksDescription",
  "classroomAnalytics.latestActivity",
  "classroomAnalytics.latestActivityDescription",
  "classroomAnalytics.studentsDescription",
  "classroomAnalytics.classCompletionRate",
  "classroomAnalytics.assignmentCompletionSummaries",
  "classroomAnalytics.summaryDescription",
  "classroomAnalytics.assignmentEvidenceSummary",
  "classroomAnalytics.notStarted",
  "classroomAnalytics.active",
  "classroomAnalytics.done",
  "classroomAnalytics.noAnalyticsYet",
  "classroomAnalytics.noAnalyticsTitle",
  "classroomAnalytics.noAnalyticsDescription",
]) {
  assert(messages.includes(`"${key}"`), `missing locale key: ${key}`);
  assert(page.includes(`"${key}"`), `analytics page does not use locale key: ${key}`);
}

assert(
  page.includes("getRequestLocale") &&
    page.includes("formatLocaleDateTime(locale") &&
    page.includes("formatNumber(locale") &&
    !page.includes("formatClassroomDateTime") &&
    page.includes('assignment.status === "assigned"'),
  "classroom analytics must use locale-aware display and preserve assigned evidence filtering",
);

for (const invariant of [
  "getTeacherClassroomWorkspace",
  "linkedPracticeSessionCount",
  "progressSummary",
  "/assignments/${assignment.id}",
  "assignmentEvidenceSummary",
]) {
  assert(page.includes(invariant), `classroom analytics invariant missing: ${invariant}`);
}

assert(
  messages.includes("Practice evidence") && messages.includes("练习证据"),
  "classroom analytics copy must preserve Practice evidence scope",
);

console.log("PASS teacher classroom analytics i18n source contract");
