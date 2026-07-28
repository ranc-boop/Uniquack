#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = (
  await readFile(resolve(process.cwd(), "src/lib/teacher-classrooms.ts"), "utf8")
).replaceAll("\r\n", "\n");
const start = source.indexOf("export async function getTeacherClassroomWorkspace");
assert(start >= 0, "Teacher classroom workspace loader is missing.");
const workspace = source.slice(start);

const firstWaveStart = workspace.indexOf("const [\n    summaries,");
const firstWaveEnd = workspace.indexOf("\n  ]);", firstWaveStart);
const firstWave = workspace.slice(firstWaveStart, firstWaveEnd);
assert(
  firstWaveStart >= 0 &&
    firstWave.includes("await Promise.all([") &&
    firstWave.includes("buildClassroomSummaries({") &&
    firstWave.includes('.from("classroom_members")') &&
    firstWave.includes("listTeacherClassroomAssignments({"),
  "Teacher classroom summary, roster, and assignments must begin in the same data wave.",
);
const evidenceWaveStart = workspace.indexOf("const [\n    { data: progressRows }");
const evidenceWaveEnd = workspace.indexOf("\n  ]);", evidenceWaveStart);
const evidenceWave = workspace.slice(evidenceWaveStart, evidenceWaveEnd);
assert(
  evidenceWaveStart >= 0 &&
    evidenceWave.includes("await Promise.all([") &&
    evidenceWave.includes('.from("student_assignment_progress")') &&
    evidenceWave.includes('.from("assignment_practice_sessions")') &&
    evidenceWave.includes('.from("profiles")'),
  "Teacher roster evidence and profiles must load in parallel once their IDs are known.",
);

console.log("PASS teacher_classroom_loading_performance_smoke");
