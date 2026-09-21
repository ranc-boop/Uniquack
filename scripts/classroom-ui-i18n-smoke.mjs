import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const [ui, messages] = await Promise.all([
  read("src/app/teacher/classrooms/classroom-ui.tsx"),
  read("src/lib/i18n/messages.ts"),
]);

for (const key of [
  "classroom.overview",
  "classroom.assignments",
  "classroom.students",
  "classroom.teachers",
  "classroom.progress",
  "classroom.blueprints",
  "classroom.settings",
  "classroom.sections",
  "classroom.page",
  "classroom.publishToClasses",
  "classroom.notEnoughData",
  "classroom.noData",
]) {
  assert(messages.includes(`"${key}"`), `missing locale key: ${key}`);
}

assert(ui.includes("getRequestLocale"), "classroom UI must resolve the request locale on the server");
assert(ui.includes("formatNumber(locale, bounded)"), "classroom progress metrics must use locale-aware number formatting");
assert(ui.includes("export async function ClassroomRouteTabs"), "route tabs must remain Server Components");
assert(ui.includes("export async function ClassroomPublishCta"), "publish CTA must remain a Server Component");
assert(ui.includes("export async function ClassroomQuickAction"), "quick action must remain a Server Component");
assert(ui.includes("export async function ClassroomProgressRing"), "progress ring must remain a Server Component");
assert(ui.includes('pendingLabel={`${t(labelKey)} ${t("classroom.page")}`}'), "route tab pending labels must be localized");
assert(ui.includes('translate(locale, "classroom.publishToClasses")'), "publish CTA default must be localized");
assert(ui.includes('translate(locale, "classroom.page")'), "quick action fallback must be localized");
assert(ui.includes('t("classroom.notEnoughData")') && ui.includes('t("classroom.noData")'), "progress no-data UI must be localized");
assert(ui.includes('href={`/teacher/classrooms/${classroomId}${href}`}'), "classroom tab href contract must remain intact");
assert(!ui.includes('"use client"'), "classroom UI must not become a Client Component");

console.log("classroom UI i18n smoke passed");
