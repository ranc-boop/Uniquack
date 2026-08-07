import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAIExtractionCoverageAuditPlanFromSummary,
  buildBatchCoverageAudit,
  buildCoverageRisks,
  buildPageCoverageAudit,
  buildPacketCoverageAudit,
  buildRecommendedRecoveryWindows,
  failedAIExtractionCoverageAuditPlan,
  mergeAIExtractionCoverageAuditPlanIntoSummary,
} from "../src/lib/ai-pdf-import/extraction-coverage-audit.ts";

function coverageSummary() {
  return {
    createdQuestions: [{ source: { pageNumbers: [1] } }],
    aiPdfImport: {
      chunking: {
        chunks: [
          {
            errorMessage: "provider timeout",
            pageNumbers: [8, 9],
            status: "failed",
          },
          {
            overlapPages: [2],
            pageNumbers: [1, 2],
            status: "completed",
          },
        ],
        mode: "sequential",
      },
      extractedSourcePages: [1],
      extractionBatchPlan: {
        batches: [
          {
            batchId: "batch-1",
            packetRefs: [{ packetId: "packet-1", pageNumbers: [1, 2] }],
            status: "completed",
          },
          {
            batchId: "batch-2",
            packetRefs: [{ packetId: "packet-2", pageNumbers: [8, 9] }],
            status: "failed",
          },
          {
            batchId: "batch-3",
            packetRefs: [{ packetId: "packet-3", pageNumbers: [10] }],
            status: "planned",
          },
        ],
      },
      packetPlan: {
        packets: [
          { packetId: "packet-1", pageNumbers: [1, 2] },
          { packetId: "packet-2", pageNumbers: [8, 9] },
          { packetId: "packet-3", pageNumbers: [10] },
        ],
        sourceKind: "pdf",
      },
      preanalysis: {
        pageCount: 10,
        pages: [
          { pageClass: "question_page", pageNumber: 1 },
          { pageClass: "question_page", pageNumber: 2 },
          { pageNumber: 8, questionNumberHints: ["8"] },
          { pageClass: "mixed_page", pageNumber: 9 },
          { pageClass: "question_page", pageNumber: 10 },
        ],
      },
      sourceInput: "gemini_native_pdf",
    },
  };
}

test("audits uncovered pages, packet coverage, and failed extraction batches", () => {
  const summary = coverageSummary();
  const pageCoverage = buildPageCoverageAudit(summary);
  const packetCoverage = buildPacketCoverageAudit(summary, pageCoverage);
  const batchCoverage = buildBatchCoverageAudit(summary, packetCoverage);

  assert.deepEqual(pageCoverage.expectedQuestionLikePages, [1, 2, 8, 9, 10]);
  assert.deepEqual(pageCoverage.extractedSourcePages, [1]);
  assert.deepEqual(pageCoverage.uncoveredQuestionLikePages, [2, 8, 9, 10]);
  assert.deepEqual(pageCoverage.terminalUncoveredPages, [8, 9, 10]);
  assert.equal(pageCoverage.pagesWithNoSourceRefs, false);

  assert.deepEqual(packetCoverage, {
    coverageRatio: 0.333,
    coveredPacketCount: 1,
    expectedPacketCount: 3,
    uncoveredPacketIds: ["packet-2", "packet-3"],
  });
  assert.deepEqual(batchCoverage, {
    coverageRatio: 0.333,
    coveredBatchCount: 1,
    expectedBatchCount: 3,
    failedBatchCount: 1,
    uncoveredBatchIds: ["batch-2", "batch-3"],
  });
});
test("classifies coverage risks and produces bounded, review-required recovery windows", () => {
  const summary = coverageSummary();
  const pageCoverage = buildPageCoverageAudit(summary);
  const packetCoverage = buildPacketCoverageAudit(summary, pageCoverage);
  const batchCoverage = buildBatchCoverageAudit(summary, packetCoverage);
  const risks = buildCoverageRisks({
    batchCoverage,
    pageCoverage,
    packetCoverage,
    summary,
  });
  const kinds = new Set(risks.map((risk) => risk.kind));

  for (const kind of [
    "question_like_page_uncovered",
    "terminal_pages_missing_from_extraction",
    "full_pdf_silent_partial_risk",
    "packet_coverage_low",
    "batch_coverage_low",
    "chunk_partial_failure",
    "overlap_duplicate_risk",
  ]) {
    assert.equal(kinds.has(kind), true, `expected coverage risk: ${kind}`);
  }
  assert.equal(
    risks.find((risk) => risk.kind === "packet_coverage_low").severity,
    "high",
  );
  assert.equal(
    risks.every((risk) => /^coverage-risk-[a-f0-9]{12}$/.test(risk.riskId)),
    true,
  );

  const windows = buildRecommendedRecoveryWindows({
    pageCoverage,
    packetCoverage,
    risks,
    summary,
  });
  assert.equal(
    windows.some(
      (window) =>
        window.reason === "terminal_uncovered_pages" &&
        window.pageNumbers.join(",") === "8,9,10",
    ),
    true,
  );
  assert.equal(
    windows.some(
      (window) =>
        window.reason === "uncovered_question_like_pages" &&
        window.pageNumbers.join(",") === "2",
    ),
    true,
  );
  assert.equal(
    windows.some((window) => window.reason === "failed_chunk_pages"),
    true,
  );
  assert.equal(new Set(windows.map((window) => window.windowId)).size, windows.length);
  assert.equal(
    windows.every(
      (window) => window.providerCallPlanned === false && window.reviewRequired,
    ),
    true,
  );
});

test("builds planning-only and failed audit contracts without provider or recovery execution", () => {
  const summary = coverageSummary();
  const plan = buildAIExtractionCoverageAuditPlanFromSummary(
    summary,
    "2026-08-08T00:00:00.000Z",
  );

  assert.equal(plan.generatedAt, "2026-08-08T00:00:00.000Z");
  assert.equal(plan.mode, "planning_only");
  assert.equal(plan.strategy, "gemini_native_full_pdf");
  assert.equal(plan.status, "completed_with_warnings");
  assert.equal(plan.stats.highRiskCount > 0, true);
  assert.equal(plan.warnings.includes("coverage_audit_no_provider_call"), true);
  assert.equal(plan.warnings.includes("coverage_audit_recovery_recommended"), true);

  const failed = failedAIExtractionCoverageAuditPlan({
    generatedAt: "2026-08-08T01:00:00.000Z",
    warnings: ["custom_warning", "custom_warning"],
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.generatedAt, "2026-08-08T01:00:00.000Z");
  assert.deepEqual(
    failed.warnings.filter((warning) => warning === "custom_warning"),
    ["custom_warning"],
  );
  assert.deepEqual(failed.recommendedRecoveryWindows, []);

  const existing = { status: "imported", createdCount: 1 };
  const merged = mergeAIExtractionCoverageAuditPlanIntoSummary(existing, failed);
  assert.notStrictEqual(merged, existing);
  assert.deepEqual(existing, { status: "imported", createdCount: 1 });
  assert.strictEqual(merged.extractionCoverageAuditPlan, failed);
});
