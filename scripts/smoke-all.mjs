
import { spawn } from "node:child_process";

function runInChildProcess(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${script} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
    });
  });
}

await import("./security-smoke.mjs");
await import("./question-assets-merged-code-audit-smoke.mjs");
await import("./question-asset-url-backfill-test.mjs");
await import("./question-asset-url-backfill-jsonb-test.mjs");
await import("./question-assets-backfill-plan-test.mjs");
await import("./question-assets-private-cutover-smoke.mjs");
await runInChildProcess("scripts/question-assets-embedded-rehearsal.mjs");
await import("./canonical-migration-governance-smoke.mjs");
await import("./migration-reconciliation-smoke.mjs");
await import("./provider-gateway-hardening-smoke.mjs");
await import("./profile-role-immutability-smoke.mjs");
await import("./markdown-latex-editor-smoke.mjs");
await import("./bulk-asset-import-smoke.mjs");
await import("./package-import-smoke.mjs");
await import("./supabase-rls-smoke.mjs");
await import("./classroom-create-rls-smoke.mjs");
await import("./classroom-foundation-smoke.mjs");
await import("./student-my-work-smoke.mjs");
await import("./teacher-assignment-flow-smoke.mjs");
await import("./assignment-practice-evidence-smoke.mjs");
await import("./practice-assignment-ux-gate-smoke.mjs");
await import("./student-my-work-ux-smoke.mjs");
await import("./teacher-assignment-standard-flow-smoke.mjs");
await import("./assignment-practice-loading-performance-smoke.mjs");
await import("./practice-provider-execution-smoke.mjs");
await import("./practice-review-concurrency-smoke.mjs");
await import("./loading-feedback-smoke.mjs");
await import("./workspace-upload-performance-smoke.mjs");
await import("./admin-import-navigation-performance-smoke.mjs");
await import("./admin-question-create-performance-smoke.mjs");
await import("./admin-review-editor-loading-smoke.mjs");
await import("./taxonomy-tree-progressive-mount-smoke.mjs");
await import("./workspace-navigation-loading-smoke.mjs");
await import("./redundancy-cleanup-smoke.mjs");
await import("./auth-context-handoff-performance-smoke.mjs");
await import("./teacher-import-workspace-read-model-smoke.mjs");
await import("./public-library-loading-performance-smoke.mjs");
await import("./practice-library-scope-finish-smoke.mjs");
await import("./teacher-progress-ui-smoke.mjs");
await import("./course-builder-assignment-bridge-smoke.mjs");
await import("./teacher-role-bank-boundary-smoke.mjs");
await import("./teacher-workspace-shell-smoke.mjs");
await import("./teacher-dashboard-real-data-smoke.mjs");
await import("./teacher-bank-loading-performance-smoke.mjs");
await import("./teacher-question-preview-smoke.mjs");
await import("./teacher-classroom-loading-performance-smoke.mjs");
await import("./teacher-progress-evidence-foundation-smoke.mjs");
await import("./teacher-assignment-attempt-drilldown-smoke.mjs");
await import("./teacher-feedback-notes-mvp-smoke.mjs");
await import("./teacher-beta-readiness-smoke.mjs");
await import("./student-workspace-shell-smoke.mjs");
await import("./student-self-study-isolation-smoke.mjs");
await import("./question-bank-foundation-smoke.mjs");
await import("./bank-share-members-smoke.mjs");
await import("./bank-import-review-smoke.mjs");
await import("./assignment-from-bank-smoke.mjs");
await import("./library-governance-smoke.mjs");
await runInChildProcess("scripts/library-governance-db-smoke.mjs");
await import("./question-bank-ui-remodel-smoke.mjs");
await import("./teacher-ai-parsing-bank-targeting-smoke.mjs");
await import("./ai-parsing-status-review-qa-smoke.mjs");
await import("./review-draft-actions-mvp-smoke.mjs");
await import("./ai-pdf-provider-failure-status-smoke.mjs");
await import("./ai-provider-resilience-smoke.mjs");
await import("./ai-provider-fallback-circuit-breaker-smoke.mjs");
await import("./ai-operations-launch-readiness-smoke.mjs");
await import("./durable-ai-job-queue-smoke.mjs");
await import("./durable-ai-job-queue-load-smoke.mjs");
await import("./local-ai-jobs-worker-smoke.mjs");
await import("./ai-parsing-boundary-duplicate-guard-smoke.mjs");
await import("./ai-parsing-selective-packet-execution-smoke.mjs");
await import("./ai-parsing-selective-execution-smoke.mjs");
await import("./ai-parsing-coverage-recovery-executor-smoke.mjs");
await import("./bank-scoped-ai-pdf-import-bridge-smoke.mjs");
await import("./blueprint-library-foundation-smoke.mjs");
await import("./blueprint-builder-core-smoke.mjs");
await import("./blueprint-to-review-drafts-generation-smoke.mjs");
await import("./classroom-ui-rebuild-smoke.mjs");
await import("./classroom-operations-smoke.mjs");
await import("./publish-center-foundation-smoke.mjs");
await import("./publish-center-v2-smoke.mjs");
await import("./batch-import-smoke.mjs");
