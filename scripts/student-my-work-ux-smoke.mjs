import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function usesMessageKeys(source, ...keys) {
  return keys.every((key) => source.includes(`"${key}"`));
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

const [workPage, detailPage, guards] = await Promise.all([
  read("src/app/student/work/page.tsx"),
  read("src/app/student/work/[id]/page.tsx"),
  read("src/lib/auth/guards.ts"),
]);

assert(
  workPage.includes("requireStudentWorkspace()") &&
    detailPage.includes("requireStudentWorkspace()") &&
    guards.includes("export async function requireStudent()") &&
    guards.includes("if (!canAccessStudent(profile.role))") &&
    detailPage.includes("getStudentAssignedWorkDetail") &&
    detailPage.includes("listStudentSentAssignmentFeedbackNotes"),
  "Student My Work routes must preserve the Student guard and scoped data readers",
);
assert(
  !/bank_members|create_question_bank|review_draft_items|createServiceRoleClient/.test(
    `${workPage}\n${detailPage}`,
  ),
  "Student My Work UI must not introduce Library management or privileged data paths",
);

assert(
  usesMessageKeys(workPage, "work.overdue", "work.dueToday", "student.dueSoon", "student.inProgress") &&
    workPage.includes("urgencyRank") &&
    workPage.includes("compareIncompleteWork") &&
    workPage.includes("const nextAssignment = incomplete[0]") &&
    usesMessageKeys(workPage, "work.doNext"),
  "My Work must sort incomplete assignments, expose one next assignment, and localize urgency labels",
);
assert(
  workPage.includes(".filter((group) => group.items.length > 0)") &&
    !workPage.includes("group.empty"),
  "My Work must omit empty urgency groups",
);
assert(
  /function CompletedSection[\s\S]*?<details>[\s\S]*?translate\(locale, "student.completed"\)/.test(
    workPage,
  ) &&
    !/function CompletedSection[\s\S]*?<details\s+open/.test(workPage),
  "Completed work must use a default-collapsed disclosure",
);
assert(
  workPage.includes("`/practice?assignmentId=${assignment.id}&returnTo=") &&
    usesMessageKeys(workPage, "work.openAssignment", "work.reviewWork"),
  "My Work CTA labels and destinations must match the action they perform",
);

assert(
  detailPage.includes("getRequestLocale()") &&
    usesMessageKeys(
      detailPage,
      "student.assignedWork",
      "work.assignmentUnavailable",
      "work.assignmentUnavailableDescription",
      "practice.backToMyWork",
      "work.dueAt",
      "work.practiceQuestions",
      "work.teacherInstructions",
      "work.continueWhereStopped",
      "work.readyToStart",
      "work.startedAt",
      "work.completedAt",
      "work.updatedAt",
      "work.practiceUnavailable",
      "work.teacherFeedback",
      "work.sentFeedback",
      "work.sentAt",
      "work.assignedQuestions",
      "work.itemSummary",
      "work.questionItemUnavailable",
      "work.questionDetails",
      "work.questionItemCannotPractice",
      "work.points",
      "work.noUsableQuestionItems",
      "work.itemListPreparing",
    ),
  "Student assignment details must localize static workflow labels without changing scoped data access",
);

const heroStart = detailPage.indexOf('<section className="student-hero">', 1);
const feedbackStart = detailPage.indexOf("{feedbackNotes.length ? (");
const itemsStart = detailPage.indexOf('"work.assignedQuestions"');
const practiceLink = detailPage.indexOf(
  "`/practice?assignmentId=${assignment.id}&returnTo=",
);
assert(
  heroStart >= 0 &&
    practiceLink > heroStart &&
    feedbackStart > practiceLink &&
    itemsStart > practiceLink,
  "Student work detail must place Start/Continue Practice in the hero before disclosures",
);
assert(
  detailPage.includes("{feedbackNotes.length ? (") &&
    detailPage.includes("<details>") &&
    !detailPage.includes("No feedback has been sent"),
  "Empty feedback must not occupy the main line and feedback history must be disclosed progressively",
);
assert(
  !detailPage.includes("full private Library remains unavailable") &&
    !workPage.includes("Focus on the next assignment"),
  "Student My Work must avoid repeated policy and focus helper copy",
);

console.log("PASS Student My Work urgency, CTA, disclosure, and concise UX contracts");
