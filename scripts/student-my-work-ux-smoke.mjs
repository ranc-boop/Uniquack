import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

const [workPage, detailPage] = await Promise.all([
  read("src/app/student/work/page.tsx"),
  read("src/app/student/work/[id]/page.tsx"),
]);

assert(
  workPage.includes("requireStudent()") &&
    detailPage.includes("requireStudent()") &&
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

for (const contract of [
  'title: "Overdue"',
  'title: "Due today"',
  'title: "Due soon"',
  'title: "In progress"',
]) {
  assert(
    workPage.includes(contract),
    `My Work urgency groups are missing ${contract}`,
  );
}
assert(
  workPage.includes("urgencyRank") &&
    workPage.includes("compareIncompleteWork") &&
    workPage.includes("const nextAssignment = incomplete[0]") &&
    workPage.includes("Do this next"),
  "My Work must sort incomplete assignments and expose one next assignment",
);
assert(
  workPage.includes(".filter((group) => group.items.length > 0)") &&
    !workPage.includes("group.empty"),
  "My Work must omit empty urgency groups",
);
assert(
  /function CompletedSection[\s\S]*?<details>[\s\S]*?<h2[^>]*>Completed<\/h2>/.test(
    workPage,
  ) &&
    !/function CompletedSection[\s\S]*?<details\s+open/.test(workPage),
  "Completed work must use a default-collapsed disclosure",
);
assert(
  workPage.includes("`/practice?assignmentId=${assignment.id}`") &&
    workPage.includes('label: "Open assignment"') &&
    workPage.includes('label: "Review work"'),
  "My Work CTA labels and destinations must match the action they perform",
);

const heroStart = detailPage.indexOf('<section className="student-hero">', 1);
const feedbackStart = detailPage.indexOf("{feedbackNotes.length ? (");
const itemsStart = detailPage.indexOf("Assigned questions");
const practiceLink = detailPage.indexOf(
  "`/practice?assignmentId=${assignment.id}`",
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
  detailPage.includes("Your teacher&apos;s") &&
    detailPage.includes("full private Library remains unavailable"),
  "Student work detail must preserve the private Library boundary copy",
);

console.log("PASS Student My Work urgency, CTA, disclosure, and privacy UX contracts");
