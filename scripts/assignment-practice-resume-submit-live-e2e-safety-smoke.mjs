#!/usr/bin/env node

// Source-only safety contract for the narrow resume-submit live harness.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const source = await readFile(
  resolve(process.cwd(), "scripts/assignment-practice-resume-submit-live-e2e.mjs"),
  "utf8",
);
const clientSource = await readFile(
  resolve(process.cwd(), "src/components/practice/practice-agent-client.tsx"),
  "utf8",
);
const questionCardSource = await readFile(
  resolve(process.cwd(), "src/components/practice/practice-question-card.tsx"),
  "utf8",
);
const persistenceSource = await readFile(
  resolve(process.cwd(), "src/lib/practice/persistence.ts"),
  "utf8",
);
const answerRestoreSource = await readFile(
  resolve(process.cwd(), "src/lib/practice/answer-restore.ts"),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function blockFrom(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `source block not found: ${startMarker}`);
  return content.slice(start, end);
}

function block(startMarker, endMarker) {
  return blockFrom(source, startMarker, endMarker);
}

for (const name of [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "CLEAN_SUPABASE_SERVICE_ROLE_KEY",
  "AI_PROVIDER_ENCRYPTION_KEY",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_ENVIRONMENT",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_EXPECTED_PROJECT_REF",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_CONFIRM_CLEANUP",
  "ASSIGNMENT_RESUME_SUBMIT_E2E_PROVIDER_MODE",
]) {
  assert(source.includes(`"${name}"`), `missing process-only variable ${name}`);
}
assert(
  source.includes('DISPOSABLE_CONFIRMATION = "DISPOSABLE_ASSIGNMENT_RESUME_SUBMIT_E2E"') &&
    source.includes('CLEANUP_CONFIRMATION = "DELETE_ASSIGNMENT_RESUME_SUBMIT_E2E_FIXTURES"') &&
    source.includes('LOCAL_FAKE_PROVIDER_MODE = "LOCAL_FAKE_HTTP_PROVIDER"') &&
    source.includes('NODE_ENV?.trim().toLowerCase() === "production"') &&
    source.includes("projectRefFromSupabaseUrl"),
  "production, disposable, cleanup, provider-mode, and project guards are required",
);
assert(
  !/dotenv|loadEnvConfig|["'`]\.env(?:\.local)?/i.test(source),
  "the narrow harness must not load environment files",
);
assert(
  !source.includes("student-v1-browser-e2e") &&
    !source.includes("startResumeAndCompleteAssignment") &&
    !source.includes("validateBrowserJourneys"),
  "the narrow harness must not import or run the full Student browser suite",
);

const preflight = block("// PREFLIGHT_READ_ONLY_START", "// PREFLIGHT_READ_ONLY_END");
assert(
  !/\.(?:insert|upsert|update|delete|remove)\s*\(/.test(preflight) &&
    !/spawn\s*\(|chromium\.launch|startLocalFakeProvider|startLocalNextServer/.test(preflight),
  "preflight-only discovery must stay read-only and must not start fixtures, servers, or a browser",
);
assert(
  source.includes("PREFLIGHT_EXIT_BEFORE_MUTATION_SERVER_BROWSER_API") &&
    source.indexOf("await runPreflightOnly()") < source.indexOf("await runFullValidation()") &&
    source.includes("STALE_ASSIGNMENT_RESUME_SUBMIT_PREFLIGHT_PASS") &&
    source.includes("STALE_ASSIGNMENT_RESUME_SUBMIT_PREFLIGHT_BLOCKED") &&
    source.includes("residue_total=") &&
    source.includes("affected_categories="),
  "preflight-only mode must exit through aggregate output before mutable execution",
);

assert(
  source.includes("signInThroughBrowser") &&
    source.includes("chromium.launch") &&
    source.includes('page.locator("#username")') &&
    source.includes('page.locator("#password")'),
  "the live path must establish the canonical authenticated Student browser session",
);
const journey = block("async function runResumeSubmitJourney", "async function collectGeneratedIds");
assert(
  journey.includes("waitForAssignmentStart(page)") &&
    journey.includes("firstStart.sessionId === reloadStart.sessionId") &&
    journey.includes("reload_session_consistency=${reloadSessionConsistency}") &&
    journey.includes("await verifyPostconditions(fixtures, contract)") &&
    !/console\.log\([^\n]*(?:sessionId|assignmentId|studentId|questionId|roundId)/.test(journey),
  "reload must resume the same session, compare IDs only in memory, and keep IDs out of output",
);
assert(
  journey.includes('[data-testid="practice-result-badge"][data-result="correct"]') &&
    !journey.includes('getByText("correct", { exact: true })') &&
    journey.includes('getByPlaceholder("Enter your final answer")') &&
    journey.includes('getByRole("button", { name: "Submit round" })'),
  "submit must use semantic controls and the unique result badge",
);

const completion = block(
  'phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_ROUTE")',
  "fakeProvider.assertUsedSafely()",
);
for (const phase of [
  "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_ROUTE",
  "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_START",
  "ASSIGNMENT_PRACTICE_COMPLETED_SESSION_CONSISTENCY",
  "ASSIGNMENT_PRACTICE_COMPLETED_RESULT_BADGE",
  "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_CONTROL",
  "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_IMMUTABILITY",
  "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_VALUE",
  "ASSIGNMENT_PRACTICE_COMPLETED_POSTCONDITIONS",
  "ASSIGNMENT_PRACTICE_MY_WORK_NAVIGATION",
  "ASSIGNMENT_PRACTICE_MY_WORK_COMPLETED_SECTION",
  "ASSIGNMENT_PRACTICE_MY_WORK_COMPLETED_ASSIGNMENT",
]) {
  assert(completion.includes(`"${phase}"`), `missing bounded completion phase ${phase}`);
}
for (const category of [
  "COMPLETED_RELOAD_ROUTE_FAILED",
  "COMPLETED_RELOAD_START_FAILED",
  "COMPLETED_SESSION_MISMATCH",
  "COMPLETED_RESULT_BADGE_TIMEOUT",
  "COMPLETED_ANSWER_CONTROL_NOT_FOUND",
  "COMPLETED_ANSWER_NOT_IMMUTABLE",
  "COMPLETED_ANSWER_VALUE_NOT_RESTORED",
  "COMPLETED_POSTCONDITION_FAILED",
  "MY_WORK_NAVIGATION_FAILED",
  "MY_WORK_COMPLETED_SECTION_NOT_FOUND",
  "MY_WORK_COMPLETED_ASSIGNMENT_NOT_FOUND",
]) {
  assert(
    source.includes(`"${category}"`) && completion.includes(`"${category}"`),
    `missing bounded completion category ${category}`,
  );
}

const answerControl = block(
  'phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_CONTROL")',
  'phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_IMMUTABILITY")',
);
const answerImmutability = block(
  'phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_IMMUTABILITY")',
  'phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_VALUE")',
);
const answerValue = block(
  'phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_VALUE")',
  'phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_POSTCONDITIONS")',
);
assert(
  completion.indexOf("ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_CONTROL") <
      completion.indexOf("ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_IMMUTABILITY") &&
    completion.indexOf("ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_IMMUTABILITY") <
      completion.indexOf("ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_VALUE"),
  "completed answer checks must run in control, immutability, then value order",
);
assert(
  answerControl.includes('getByPlaceholder("Enter your final answer", { exact: true })') &&
    answerControl.includes("completedAnswerControl.waitFor") &&
    answerControl.includes('element.tagName === "TEXTAREA" || element.tagName === "INPUT"') &&
    answerControl.includes('diagnostics.completedAnswerControl = "MISSING"') &&
    answerControl.includes('diagnostics.completedAnswerControl = "PRESENT"') &&
    answerControl.includes('"COMPLETED_ANSWER_CONTROL_NOT_FOUND"') &&
    !answerControl.includes(".first()") &&
    !answerControl.includes("COMPLETED_ANSWER_VALUE_NOT_RESTORED"),
  "missing or wrong-type completed answer controls must map only to the control category",
);
assert(
  answerImmutability.includes('if (element.disabled) return "DISABLED"') &&
    answerImmutability.includes('if (element.readOnly) return "READ_ONLY"') &&
    answerImmutability.includes('diagnostics.completedAnswerImmutable = "NO"') &&
    answerImmutability.includes('diagnostics.completedAnswerImmutable = "YES"') &&
    answerImmutability.includes('"COMPLETED_ANSWER_NOT_IMMUTABLE"') &&
    !answerImmutability.includes("COMPLETED_ANSWER_VALUE_NOT_RESTORED") &&
    !answerImmutability.includes("COMPLETED_ANSWER_CONTROL_NOT_FOUND"),
  "enabled completed controls must map only to the immutability category",
);
assert(
  answerValue.includes('diagnostics.completedAnswerValue = "MISSING"') &&
    answerValue.includes('diagnostics.completedAnswerValue = "PRESENT"') &&
    answerValue.includes("Boolean(element.value.trim())") &&
    answerValue.includes('"COMPLETED_ANSWER_VALUE_NOT_RESTORED"') &&
    !answerValue.includes("inputValue()") &&
    !answerValue.includes(".length") &&
    !answerValue.includes("COMPLETED_ANSWER_NOT_IMMUTABLE") &&
    !answerValue.includes("COMPLETED_ANSWER_CONTROL_NOT_FOUND") &&
    !/(?:console\.|writeFile|appendFile|createWriteStream|createHash|JSON\.stringify|setItem)/.test(answerValue),
  "the completed answer value check must retain only a boolean and map empty values only to its category",
);
assert(
  completion.includes('getByRole("heading", {') &&
    completion.includes('name: "Completed"') &&
    completion.includes('page.locator("section").filter({ has: completedHeading })') &&
    completion.includes('name: contract.assignmentTitle') &&
    completion.includes('getByRole("link", { exact: true, name: "Review work" })') &&
    !completion.includes('getByText("Completed", { exact: true })') &&
    !completion.includes(".first()"),
  "completion must scope the fixture Assignment to the semantic Completed section",
);

const execution = block("async function runFullValidation", "const args = process.argv.slice(2)");
assert(
  journey.indexOf("diagnostics.assignmentStartHttpStatus = firstStart.status") >
      journey.indexOf("const firstStart = await firstStartPromise") &&
    journey.indexOf("diagnostics.reviewCategory = review.category") >
      journey.indexOf("const review = await reviewPromise") &&
    journey.indexOf("diagnostics.gradeCategory = grade.category") >
      journey.indexOf("gradeObserver.read") &&
    journey.indexOf('diagnostics.resultBadgeState = "PRESENT"') <
      journey.indexOf('phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_ROUTE")') &&
    journey.indexOf('diagnostics.persistenceResult = "PASS"') <
      journey.indexOf('phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_ROUTE")') &&
    journey.indexOf('diagnostics.completedResultBadgeState = "PRESENT"') <
      journey.indexOf('phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_ANSWER_CONTROL")') &&
    execution.includes("const diagnostics = createJourneyDiagnostics()") &&
    execution.includes("diagnostics.assignmentStartHttpStatus") &&
    execution.includes("diagnostics.reviewCategory") &&
    execution.includes("diagnostics.gradeCategory") &&
    source.includes("diagnostics.gradeHttpStatus = grade.status") &&
    execution.includes("gradeHttpStatusLabel(diagnostics)") &&
    execution.includes("diagnostics.reloadSessionConsistency") &&
    execution.includes("diagnostics.resultBadgeState") &&
    execution.includes("diagnostics.persistenceResult") &&
    execution.includes("diagnostics.completedResultBadgeState") &&
    execution.includes("printCompletedAnswerDiagnostics(diagnostics)") &&
    !execution.includes("reviewResultCategory") &&
    !execution.includes("gradeResultCategory"),
  "observed Start, review, grade, result, and persistence diagnostics must survive later UI assertions",
);

const answerDiagnosticOutput = block(
  "function printCompletedAnswerDiagnostics",
  "function classifyPracticeAnswer",
);
assert(
  answerDiagnosticOutput.includes('browser_answer_control_value=${diagnostics.browserAnswerControlValue}') &&
    answerDiagnosticOutput.includes('review_request_answer=${diagnostics.reviewRequestAnswer}') &&
    answerDiagnosticOutput.includes('persisted_attempt_row=${diagnostics.persistedAttemptRow}') &&
    answerDiagnosticOutput.includes('persisted_attempt_answer=${diagnostics.persistedAttemptAnswer}') &&
    answerDiagnosticOutput.includes('session_detail_attempt=${diagnostics.sessionDetailAttempt}') &&
    answerDiagnosticOutput.includes('session_detail_answer=${diagnostics.sessionDetailAnswer}') &&
    answerDiagnosticOutput.includes('completed_answer_control=${diagnostics.completedAnswerControl}') &&
    answerDiagnosticOutput.includes('completed_answer_immutable=${diagnostics.completedAnswerImmutable}') &&
    answerDiagnosticOutput.includes('completed_answer_value=${diagnostics.completedAnswerValue}') &&
    answerDiagnosticOutput.includes('persistedAttemptRow !== "NOT_CHECKED"') &&
    answerDiagnosticOutput.includes('sessionDetailAttempt !== "NOT_CHECKED"') &&
    answerDiagnosticOutput.includes('completedAnswerControl !== "NOT_CHECKED"') &&
    !answerDiagnosticOutput.includes("inputValue") &&
    !/(?:writeFile|appendFile|createWriteStream|createHash|JSON\.stringify)/.test(answerDiagnosticOutput),
  "completed answer output must expose only bounded state labels after validation starts",
);

const browserAnswerDiagnostic = block(
  'phase(fixtures, "ASSIGNMENT_PRACTICE_ANSWER_INPUT")',
  'phase(fixtures, "ASSIGNMENT_PRACTICE_SUBMIT")',
);
assert(
  browserAnswerDiagnostic.includes('getByPlaceholder("Enter your final answer")') &&
    browserAnswerDiagnostic.includes('answerControl.fill("2")') &&
    browserAnswerDiagnostic.includes("answerControl.evaluate") &&
    browserAnswerDiagnostic.includes("Boolean(element.value.trim())") &&
    browserAnswerDiagnostic.includes('diagnostics.browserAnswerControlValue = browserAnswerPresent ? "PRESENT" : "EMPTY"') &&
    browserAnswerDiagnostic.includes('waitForReview(page, contract.questionId)') &&
    !browserAnswerDiagnostic.includes("inputValue()") &&
    !/(?:console\.|writeFile|appendFile|createWriteStream|createHash|JSON\.stringify|setItem)/.test(
      browserAnswerDiagnostic,
    ),
  "pre-submit diagnostics must retain only browser answer presence",
);

const answerClassifier = block(
  "function classifyPracticeAnswer",
  "async function sessionDetailAttemptDiagnostics",
);
assert(
  answerClassifier.includes('value === null || value === undefined') &&
    answerClassifier.includes('return value.trim() ? "PRESENT" : "EMPTY"') &&
    answerClassifier.includes('typeof value === "number" || typeof value === "boolean"') &&
    answerClassifier.includes('return { answer: "NOT_CHECKED", row: "MISSING" }') &&
    answerClassifier.includes('return { answer: "NOT_CHECKED", row: "AMBIGUOUS" }') &&
    !/(?:console\.|writeFile|appendFile|createWriteStream|createHash|JSON\.stringify|setItem)/.test(
      answerClassifier,
    ),
  "answer and attempt-row classifiers must retain only bounded states",
);

const persistedAnswerDiagnostic = block(
  'phase(fixtures, "ASSIGNMENT_PRACTICE_PERSISTENCE")',
  'phase(fixtures, "ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_ROUTE")',
);
assert(
  persistedAnswerDiagnostic.includes('.select("answer")') &&
    persistedAnswerDiagnostic.includes('.eq("session_id", firstStart.sessionId)') &&
    persistedAnswerDiagnostic.includes('.eq("round_id", fixtures.roundIds[0])') &&
    persistedAnswerDiagnostic.includes('.eq("user_id", contract.studentId)') &&
    persistedAnswerDiagnostic.includes('.eq("source_question_id", contract.questionId)') &&
    persistedAnswerDiagnostic.includes('.order("created_at", { ascending: false })') &&
    persistedAnswerDiagnostic.includes("classifyPersistedAttemptRows(persistedAttempts)") &&
    persistedAnswerDiagnostic.includes('diagnostics.persistedAttemptRow =') &&
    persistedAnswerDiagnostic.includes('diagnostics.persistedAttemptAnswer =') &&
    !/(?:console\.|writeFile|appendFile|createWriteStream|createHash|JSON\.stringify|setItem)/.test(
      persistedAnswerDiagnostic,
    ),
  "persisted answer diagnostics must retain only a bounded presence state",
);
const sessionDetailDiagnostic = block(
  "async function sessionDetailAttemptDiagnostics",
  "function phase",
);
assert(
  sessionDetailDiagnostic.includes("response.ok") &&
    sessionDetailDiagnostic.includes("payload?.session?.rounds") &&
    sessionDetailDiagnostic.includes("item?.id === expectedRoundId") &&
    sessionDetailDiagnostic.includes("item?.sourceQuestionId === expectedSourceId") &&
    sessionDetailDiagnostic.includes("classify(attempt.answer)") &&
    !/(?:console\.|writeFile|appendFile|createWriteStream|createHash|JSON\.stringify|setItem)/.test(
      sessionDetailDiagnostic,
    ),
  "session-detail answer diagnostics must retain only bounded states",
);
assert(
  completion.indexOf("diagnostics.sessionDetailAttempt =") <
      completion.indexOf("ASSIGNMENT_PRACTICE_COMPLETED_RESULT_BADGE") &&
    journey.indexOf("diagnostics.persistedAttemptRow =") <
      journey.indexOf("ASSIGNMENT_PRACTICE_COMPLETED_RELOAD_ROUTE"),
  "persistence and session-detail answer presence must be captured before completed UI assertions",
);

const reviewDiagnostics = block("function reviewCategory", "async function verifyPostconditions");
assert(
  reviewDiagnostics.includes("REVIEW_SUCCESS_EVENT") &&
    reviewDiagnostics.includes("REVIEW_ERROR_EVENT") &&
    reviewDiagnostics.includes("REVIEW_STREAM_INCOMPLETE") &&
    reviewDiagnostics.includes("GRADE_RESPONSE_2XX") &&
    reviewDiagnostics.includes("GRADE_NOT_REQUIRED") &&
    reviewDiagnostics.includes("reviewRequestAnswerState") &&
    reviewDiagnostics.includes("request.postDataJSON()") &&
    reviewDiagnostics.includes('classifyPracticeAnswer(attempt.answer) === "PRESENT"') &&
    reviewDiagnostics.includes('return "NOT_OBSERVED"') &&
    !/console\.(?:log|error|warn)/.test(reviewDiagnostics) &&
    !/(?:writeFile|appendFile|createWriteStream)/.test(reviewDiagnostics),
  "review SSE and grade responses must collapse to bounded in-memory categories",
);
assert(
  source.includes('let code = status >= 200 && status < 300 ? "NONE" : "UNRECOGNIZED_API_CODE"') &&
    source.includes("assignment_start_code=") &&
    !source.includes("response_body=") &&
    !source.includes("review_stream=") &&
    !source.includes("model_output="),
  "successful Start must map to NONE and output must not include raw response data",
);
assert(
  !/console\.log\([^\n]*(?:username|password|email|serviceRoleKey|anonKey|cookie|header|baseUrl)/i.test(source),
  "credentials, identities, URLs, headers, and cookies must never be printed",
);

// NON_LIVE_COMPLETED_ANSWER_SOURCE_PROOF
const sessionDetailSource = blockFrom(
  persistenceSource,
  "export async function getPracticeSession",
  "export async function createPracticeSession",
);
assert(
  sessionDetailSource.includes('.from("practice_attempts")') &&
    sessionDetailSource.includes("answer: normalizePersistedPracticeAnswer(attempt.answer)") &&
    sessionDetailSource.includes("sourceQuestionId: attempt.source_question_id"),
  "session detail must read and normalize the persisted Practice answer",
);
assert(
  answerRestoreSource.includes("normalizePersistedPracticeAnswer") &&
    answerRestoreSource.includes("restoredPracticeQuestionId") &&
    answerRestoreSource.includes("buildRestoredPracticeAnswers"),
  "completed answer restoration must share normalization and canonical identity helpers",
);
const restoreSource = blockFrom(
  clientSource,
  "function restoreRoundFromHistory",
  "useEffect(() =>",
);
assert(
  restoreSource.includes("buildRestoredPracticeAnswers(") &&
    restoreSource.includes("restoredPracticeQuestionId(attempt, round.questions)") &&
    restoreSource.includes("setAnswers(restoredAnswers)"),
  "completed history must map each restored answer through its restored question identity",
);
assert(
  clientSource.includes("currentAnswer={answers[question.id]}") &&
    clientSource.includes("const answersRef = useRef<AnswersState>({})") &&
    clientSource.includes("answersRef.current = nextAnswers") &&
    clientSource.includes("answer: answersRef.current[question.id] ?? \"\"") &&
    questionCardSource.includes("answer={currentAnswer}") &&
    questionCardSource.includes('disabled={phase === "feedback"}') &&
    questionCardSource.includes("value={answerValue(answer)}"),
  "the completed Question card must receive the restored answer and render it immutably",
);

assert(
  source.includes("startLocalFakeProvider") &&
    source.includes("createFixtureProvider") &&
    source.includes("fakeProvider.assertUsedSafely()") &&
    source.includes('"OPENAI_API_KEY"') &&
    source.includes('"GEMINI_API_KEY"') &&
    source.includes('"DEEPSEEK_API_KEY"') &&
    source.includes('delete environment[name]') &&
    !/https:\/\/(?:api\.openai\.com|api\.deepseek\.com|generativelanguage\.googleapis\.com)/i.test(source),
  "the harness must select only its local fake HTTP Provider and strip real-provider variables",
);

const cleanup = block("async function cleanupFixtures", "async function inspectPreferenceState");
for (const table of [
  "practice_hint_events",
  "practice_reflection_records",
  "practice_weakness_links",
  "practice_wrong_questions",
  "practice_attempts",
  "practice_agent_episodes",
  "practice_round_questions",
  "practice_rounds",
  "assignment_practice_sessions",
  "student_assignment_progress",
  "practice_preference_merge_jobs",
  "practice_sessions",
  "user_practice_preferences",
  "assignment_items",
  "assignments",
  "bank_questions",
  "questions",
  "bank_members",
  "question_banks",
  "classroom_members",
  "classrooms",
  "ai_provider_profiles",
  "organization_members",
  "profiles",
  "organizations",
]) {
  assert(cleanup.includes(`"${table}"`), `cleanup is missing ${table}`);
}
assert(
  cleanup.includes("auth.admin.deleteUser") &&
    cleanup.includes("readStaleFixtureCounts") &&
    cleanup.includes("failedCategories") &&
    source.includes("cleanupPassed = await cleanupFixtures") &&
    source.includes('failureCategory = "CLEANUP_FAILED"'),
  "exact-ID cleanup must cover every fixture family and verify zero residue",
);

assert(
  source.includes("verifyFirstStartPrecondition") &&
    source.includes("preferenceCount === 0") &&
    source.includes("sessionCount === 0") &&
    source.includes("mergeCount === 0") &&
    source.includes("sessions.length === 1") &&
    source.includes("rounds.length === 1") &&
    source.includes("assignmentLinkCount === 1") &&
    source.includes("progressCount === 1"),
  "the harness must prove first start and one-session resume postconditions",
);

const teardown = block("function childExitObserved", "async function startLocalNextServer");
assert(
  teardown.includes("child.exitCode !== null || child.signalCode !== null") &&
    teardown.includes('child.kill("SIGTERM")') &&
    teardown.includes('spawn("taskkill", ["/PID", String(childPid), "/T", "/F"]') &&
    teardown.includes('process.platform === "win32"') &&
    teardown.includes("waitForPortClosed(port, SERVER_PORT_CLOSE_TIMEOUT_MS)") &&
    !teardown.includes('"/IM"') &&
    !teardown.toLowerCase().includes("node.exe") &&
    !teardown.includes("Get-Process") &&
    !teardown.includes("Stop-Process"),
  "server teardown must be bounded and target only the retained child PID tree",
);
assert(
  source.includes("processEnvironmentCleared = clearProcessEnvironment()") &&
    source.includes("temporary_server_stopped=") &&
    source.includes("process_environment_cleared=") &&
    source.indexOf("if (server)") < source.indexOf("cleanupPassed = await cleanupFixtures") &&
    source.indexOf("cleanupPassed = await cleanupFixtures") <
      source.indexOf("processEnvironmentCleared = clearProcessEnvironment()"),
  "server shutdown, cleanup, and process-variable clearing must stay independently visible",
);

console.log("PASS Assignment Practice resume-submit live harness safety contract");
