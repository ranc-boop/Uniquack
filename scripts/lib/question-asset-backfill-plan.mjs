// Shared two-phase plan for legacy question-asset URL backfills. It deliberately
// creates every update in memory before an --apply caller can issue a write.

export function buildQuestionAssetBackfillPlan({ rowsByTarget, rewriteRow }) {
  const summary = {
    totals: {
      rowsScanned: 0,
      rowsChanged: 0,
      urlsReplaced: 0,
      urlsUnmapped: 0,
      urlsMalformed: 0,
    },
    targets: [],
  };
  const updates = [];

  for (const { target, rows } of rowsByTarget) {
    const targetSummary = {
      table: target.table,
      column: target.column,
      rowsScanned: rows.length,
      rowsChanged: 0,
      urlsReplaced: 0,
      urlsUnmapped: 0,
      urlsMalformed: 0,
    };

    for (const row of rows) {
      summary.totals.rowsScanned += 1;
      const result = rewriteRow(row, target);
      const unmapped = result.unmapped ?? [];
      const malformed = result.malformed ?? [];

      targetSummary.urlsUnmapped += unmapped.length;
      targetSummary.urlsMalformed += malformed.length;
      summary.totals.urlsUnmapped += unmapped.length;
      summary.totals.urlsMalformed += malformed.length;

      if (!result.changed) {
        continue;
      }

      targetSummary.rowsChanged += 1;
      targetSummary.urlsReplaced += result.replaced;
      summary.totals.rowsChanged += 1;
      summary.totals.urlsReplaced += result.replaced;
      updates.push({
        table: target.table,
        column: target.column,
        rowId: row.id,
        value: result.value,
      });
    }

    summary.targets.push(targetSummary);
  }

  return { summary, updates };
}

export function assertQuestionAssetBackfillApplyAllowed(plan) {
  const { urlsMalformed, urlsUnmapped } = plan.summary.totals;
  if (urlsUnmapped > 0 || urlsMalformed > 0) {
    throw new Error(
      `Refusing --apply before any write: ${urlsUnmapped} unmapped and ${urlsMalformed} malformed legacy question-assets URL occurrence(s) remain.`,
    );
  }
}

// Reports intentionally contain counts by field only. Row IDs, asset paths, source
// URLs, and private question content stay in memory and are never written to disk.
export function createQuestionAssetBackfillReport({ mode, plan, appliedUpdates = 0 }) {
  return {
    mode,
    generatedAt: new Date().toISOString(),
    totals: plan.summary.totals,
    targets: plan.summary.targets,
    plannedUpdates: plan.updates.length,
    appliedUpdates,
  };
}
