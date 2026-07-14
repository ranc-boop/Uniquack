import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function loadExecutor() {
  const source = await read("src/lib/ai-pdf-import/coverage-recovery-executor.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: "coverage-recovery-executor.ts",
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`,
  );
}

function summary({ pages = [8, 9], sourceAuditPlanPresent = true } = {}) {
  return {
    aiPdfImport: {
      coverageRecoveryPlan: {
        mode: "planning_only",
        sourceAuditPlanPresent,
        version: "coverage_recovery_plan_v1",
        requestDrafts: [
          {
            pageNumbers: pages,
            promptContract: {
              boundedPagesOnly: true,
              recoverMissingQuestionsOnly: true,
              requireSourcePageRefs: true,
            },
            providerRouting: { preferredStrategy: "gemini_native_page_window" },
            requestId: "coverage-request-safe",
            requestKind: "coverage_uncovered_page_extraction",
            sourceTaskId: "coverage-task-safe",
          },
        ],
      },
    },
  };
}

const executor = await loadExecutor();
const source = await read("src/lib/ai-pdf-import/coverage-recovery-executor.ts");
const service = await read("src/lib/ai-pdf-import/service.ts");
const worker = await read("src/lib/ai-jobs/worker.ts");
const queue = await read("src/lib/ai-jobs/queue.ts");
const jobTypes = await read("src/lib/ai-jobs/types.ts");
const migration = await read("supabase/clean-migrations/0038_ai_pdf_coverage_recovery_jobs.sql");
const actions = await read("src/app/teacher/banks/actions.ts");
const importUi = await read("src/app/teacher/banks/bank-import-ui.tsx");
const smokeAll = await read("scripts/smoke-all.mjs");

const eligible = executor.buildAICoverageRecoveryExecutionPlan({
  actorCanManageBank: true,
  bankActive: true,
  originalBatchStatus: "imported",
  sourcePageCount: 16,
  sourceReady: true,
  summary: summary(),
});
assert(eligible.status === "eligible" && eligible.planHash?.length === 64, "completed imports with bounded audit windows must create a stable recovery plan");
assert(eligible.windows.length === 1 && eligible.windows[0].pageNumbers.join(",") === "8,9", "recovery plans must retain only server-derived bounded source pages");
assert(!JSON.stringify(eligible).match(/base64|prompt|provider.?response|signed.?url/i), "execution plan must not persist source bytes, prompts, or provider payloads");

const broad = executor.buildAICoverageRecoveryExecutionPlan({
  actorCanManageBank: true,
  bankActive: true,
  originalBatchStatus: "imported",
  sourcePageCount: 8,
  sourceReady: true,
  summary: summary({ pages: [1, 2, 3, 4, 5, 6, 7] }),
});
assert(broad.status === "blocked" && broad.blockers.includes("recovery_window_too_broad"), "near-whole-document rereads must be blocked");

const blocked = executor.buildAICoverageRecoveryExecutionPlan({
  actorCanManageBank: false,
  bankActive: false,
  originalBatchStatus: "draft",
  sourcePageCount: 16,
  sourceReady: false,
  summary: summary({ sourceAuditPlanPresent: false }),
});
for (const blocker of ["original_import_not_complete", "missing_coverage_audit", "source_not_ready", "bank_not_active", "teacher_permission_missing"]) {
  assert(blocked.blockers.includes(blocker), `recovery must block ${blocker}`);
}

function classificationFor(issueKind) {
  return executor.classifyAICoverageRecoveryCandidate({
    candidateId: "candidate",
    guardPlan: {
      associationRisks: [],
      boundaryGroups: [],
      duplicateGroups: [{ questionIds: ["candidate"], issueKind }],
    },
  });
}

assert(classificationFor("recovery_duplicate") === "likely_duplicate", "recovery duplicates must not be drafted automatically");
assert(classificationFor("question_number_conflict") === "visible_number_conflict", "visible-number conflicts must remain review suggestions");
assert(classificationFor("cross_page_fragment") === "possible_fragment_completion", "fragment candidates must not become automatic drafts");
assert(classificationFor("answer_alignment") === "answer_alignment_risk", "answer alignment risks must remain review suggestions");
assert(classificationFor("visual_association") === "visual_association_risk", "visual association risks must remain review suggestions");
assert(executor.classifyAICoverageRecoveryCandidate({ candidateId: "new", guardPlan: { associationRisks: [], boundaryGroups: [], duplicateGroups: [] } }) === "new_candidate", "only clean recovery candidates may enter the review handoff");
assert(executor.classifyAICoverageRecoveryCandidate({ candidateId: "uncertain", guardPlan: { associationRisks: [], boundaryGroups: [], duplicateGroups: [] }, hasSufficientEvidence: false }) === "insufficient_evidence", "candidates without bounded source evidence must remain suggestions");

assert(source.includes('"coverage_recovery_executor_v1"'), "recovery execution must be versioned");
assert(jobTypes.includes('"ai_pdf_coverage_recovery"'), "durable queue types must include the recovery kind");
assert(queue.includes("buildAIPdfCoverageRecoveryJobIdempotencyKey"), "recovery jobs need a stable server idempotency key");
assert(worker.includes("runAIPdfCoverageRecoveryJob") && worker.includes("processAIPdfCoverageRecovery"), "durable worker must execute recovery through the existing queue");
assert(service.includes("processAIPdfCoverageRecovery") && service.includes("recoveryOnly: true"), "service must use a bounded recovery-only path");
assert(service.includes("recoveryProvenance: recovery ? \"recovery\" : \"original\""), "recovery lineage must survive normalized import metadata");
assert(!/processAIPdfImport\(\{[\s\S]{0,400}recovery/i.test(service), "recovery must not fall back to unrestricted full-import execution");
assert(actions.includes("queueBankPdfCoverageRecovery") && actions.includes("assertNoRawProviderConfig"), "teacher recovery action must remain server-routed and reject provider config fields");
assert(migration.includes("0038") || migration.includes("ai_pdf_coverage_recovery"), "forward migration must extend the existing queue only");
assert(migration.includes("active_recovery") && migration.includes("Trusted worker role required."), "recovery claims must remain service-role-only and bounded");
assert(!migration.match(/insert into public\.questions|approve_bank_review_question|insert into public\.assignments/i), "queue migration must not publish, approve, or assign content");
assert(importUi.includes("Some likely question pages were not represented in the first extraction.") && importUi.includes("Additional Review Drafts were recovered for teacher review."), "teacher import status must use recovery-safe copy");
assert(smokeAll.includes("ai-parsing-coverage-recovery-executor-smoke.mjs"), "aggregate smoke must include recovery executor coverage");

console.log("AI Parsing coverage recovery executor smoke passed.");
