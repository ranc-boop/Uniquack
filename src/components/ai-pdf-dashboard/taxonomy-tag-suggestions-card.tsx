import { TaxonomyTagChips } from "@/components/tags/taxonomy-tag-chips";
import { Badge } from "@/components/ui/badge";

const FACET_CATEGORIES = [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const numeric = Number(value);

  return Number.isFinite(numeric) ? numeric : fallback;
}

function stringList(value: unknown) {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function percentLabel(value: unknown) {
  const numeric = numberValue(value, NaN);

  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return numeric <= 1
    ? `${Math.round(numeric * 100)}%`
    : `${Math.round(numeric)}%`;
}

function difficultyLabel(value: unknown) {
  const numeric = numberValue(value, NaN);

  if (!Number.isFinite(numeric)) {
    return "-";
  }

  return numeric <= 1 ? numeric.toFixed(2) : String(Math.round(numeric));
}

function suggestionTagIds(suggestion: Record<string, unknown>) {
  const tags = asRecord(suggestion.tags);
  return FACET_CATEGORIES.flatMap((category) => stringList(tags[category]));
}

function suggestionWarnings(suggestion: Record<string, unknown>) {
  const validation = asRecord(suggestion.validation);

  return uniqueStrings([
    ...stringList(suggestion.warnings),
    ...stringList(validation.warnings),
    ...stringList(validation.errors),
  ]);
}

function hasAmbiguousWarning(suggestion: Record<string, unknown>) {
  return suggestionWarnings(suggestion).some((warning) =>
    warning.toLowerCase().includes("ambiguous"),
  );
}

function questionLabel(suggestion: Record<string, unknown>, index: number) {
  const questionRef = asRecord(suggestion.questionRef);
  const code = stringValue(questionRef.questionCode);
  const title = stringValue(questionRef.titlePreview);
  const fallback = `Question suggestion ${index + 1}`;

  return [code || fallback, title].filter(Boolean).join(" - ");
}

export function TaxonomyTagSuggestionsCard({
  ai,
}: {
  ai: Record<string, unknown>;
}) {
  const plan = asRecord(ai.taxonomyQuestionTaggingPlan);
  const suggestions = asArray(plan.suggestions).map(asRecord);

  if (!stringValue(plan.version) && !suggestions.length) {
    return null;
  }

  const planWarnings = uniqueStrings(stringList(plan.warnings));
  const itemCount =
    numberValue(plan.itemCount, NaN) || suggestions.length;
  const validBundleCount = suggestions.filter(
    (suggestion) => booleanValue(asRecord(suggestion.validation).valid),
  ).length;
  const warningCount =
    planWarnings.length +
    suggestions.reduce(
      (total, suggestion) => total + suggestionWarnings(suggestion).length,
      0,
    );
  const ambiguousSuggestionCount = suggestions.filter(hasAmbiguousWarning).length;
  const reviewRequiredCount = suggestions.filter(
    (suggestion) => suggestion.reviewRequired !== false,
  ).length;

  return (
    <div className="rounded-md border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">Taxonomy tag suggestions</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Compact planning-only suggestions. Format valid means the bundle
            matches catalog rules; tutor review is still required before official
            assignment writes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Items: {itemCount}</Badge>
          <Badge variant="outline">Format valid: {validBundleCount}</Badge>
          <Badge variant="outline">Warnings: {warningCount}</Badge>
          <Badge variant="outline">Ambiguous: {ambiguousSuggestionCount}</Badge>
          <Badge variant="outline">Review required: {reviewRequiredCount}</Badge>
        </div>
      </div>

      {planWarnings.length ? (
        <div className="mt-3 rounded border bg-background/80 p-2 text-xs">
          <p className="font-medium">Plan warnings</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
            {planWarnings.slice(0, 4).map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        {suggestions.length ? (
          suggestions.map((suggestion, index) => {
            const validation = asRecord(suggestion.validation);
            const warnings = suggestionWarnings(suggestion);
            const reviewRequired = suggestion.reviewRequired !== false;
            const validationStatus = booleanValue(validation.valid)
              ? "format valid"
              : "needs review";
            const tagIds = suggestionTagIds(suggestion);

            return (
              <details
                className="rounded-md border bg-background/80 p-3"
                key={`${questionLabel(suggestion, index)}-${index}`}
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{questionLabel(suggestion, index)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Difficulty {difficultyLabel(suggestion.difficultySuggestion)}
                        {" | "}
                        Confidence {percentLabel(suggestion.confidence)}
                        {" | "}
                        {validationStatus}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={reviewRequired ? "outline" : "secondary"}>
                        {reviewRequired ? "Review required" : "Review optional"}
                      </Badge>
                      {warnings.length ? (
                        <Badge variant="outline">{warnings.length} warnings</Badge>
                      ) : null}
                    </div>
                  </div>
                </summary>
                <div className="mt-3 space-y-3">
                  <TaxonomyTagChips tagIds={tagIds} />
                  {warnings.length ? (
                    <div className="rounded border bg-muted/20 p-2 text-xs">
                      <p className="font-medium">Warnings</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                        {warnings.slice(0, 4).map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                      {warnings.length > 4 ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer font-medium">
                            Show remaining warnings (+{warnings.length - 4})
                          </summary>
                          <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                            {warnings.slice(4).map((warning) => (
                              <li key={warning}>{warning}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </details>
            );
          })
        ) : (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            No taxonomy question tag suggestions were generated for this
            import.
          </p>
        )}
      </div>
    </div>
  );
}
