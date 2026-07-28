#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `Missing source block: ${startMarker}`);
  return source.slice(start, end);
}

const source = (
  await readFile(
    resolve(process.cwd(), "src/lib/practice/assignment-linkage.ts"),
    "utf8",
  )
).replaceAll("\r\n", "\n");
const resumeLoader = block(
  source,
  "async function loadAssignmentPracticeResumeContext",
  "async function assertStudentProfile",
);
const contentLoader = block(
  source,
  "async function loadAssignedQuestionPracticeItems",
  "export async function startAssignmentPractice",
);
const startFlow = source.slice(
  source.indexOf("export async function startAssignmentPractice"),
);

assert(
  resumeLoader.includes("await Promise.all([") &&
    resumeLoader.includes('.from("student_assignment_progress")') &&
    resumeLoader.includes('.from("assignment_practice_sessions")'),
  "Assignment resume progress and linked sessions must load in the same data wave.",
);
assert(
  contentLoader.includes("await Promise.all([") &&
    contentLoader.includes('.from("questions")') &&
    contentLoader.includes('.from("question_taxonomy_assignments")'),
  "Assignment questions and their approved taxonomy must load in the same data wave.",
);
assert(
  startFlow.includes("const studentProfilePromise = assertStudentProfile(") &&
    startFlow.includes("const assignmentContentPromise = loadAssignedQuestionPracticeItems(") &&
    startFlow.includes("await Promise.allSettled([") &&
    startFlow.indexOf("const studentProfilePromise") <
      startFlow.indexOf("await Promise.allSettled([") &&
    startFlow.indexOf("const assignmentContentPromise") <
      startFlow.indexOf("await Promise.allSettled(["),
  "Assignment visibility work must overlap the student eligibility lookup.",
);

console.log("PASS assignment_practice_loading_performance_smoke");
