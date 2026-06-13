export type WarningSummaryData = {
  debugWarnings: string[];
  visibleWarnings: string[];
};

export function WarningSummary({
  aggregatedWarnings,
  hiddenWarningCount,
  technicalError,
  visibleWarnings,
}: {
  aggregatedWarnings: WarningSummaryData;
  hiddenWarningCount: number;
  technicalError: string;
  visibleWarnings: string[];
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-sm font-medium">Warnings</p>
      {aggregatedWarnings.visibleWarnings.length ? (
        <>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {visibleWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
          {hiddenWarningCount ? (
            <details className="mt-3 rounded-md border bg-background p-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                Show all warnings (+{hiddenWarningCount})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {aggregatedWarnings.visibleWarnings
                  .slice(5)
                  .map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
              </ul>
            </details>
          ) : null}
          {aggregatedWarnings.debugWarnings.length !==
          aggregatedWarnings.visibleWarnings.length ? (
            <details className="mt-3 rounded-md border bg-background p-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                Debug details ({aggregatedWarnings.debugWarnings.length} raw
                warnings)
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {aggregatedWarnings.debugWarnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {technicalError ? (
            <details className="mt-3 rounded-md border bg-background p-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                Technical details
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap">
                {technicalError}
              </pre>
            </details>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-2 text-xs text-muted-foreground">
            No warnings reported for this import.
          </p>
          {technicalError ? (
            <details className="mt-3 rounded-md border bg-background p-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                Technical details
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap">
                {technicalError}
              </pre>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
