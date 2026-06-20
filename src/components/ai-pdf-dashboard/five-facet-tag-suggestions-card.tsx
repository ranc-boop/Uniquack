import { Badge } from "@/components/ui/badge";

const FACET_CATEGORIES = [
  "curriculum",
  "concept",
  "method",
  "task",
  "form",
] as const;

type FacetCategory = (typeof FACET_CATEGORIES)[number];

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

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function facetTags(
  tags: Record<string, unknown>,
  category: FacetCategory,
) {
  return stringList(tags[category]);
}

function suggestionWarnings(suggestion: Record<string, unknown>) {
  const validation = asRecord(suggestion.validation);

  return [
    ...stringList(suggestion.warnings),
    ...stringList(validation.warnings),
    ...stringList(validation.errors),
  ];
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

export function FiveFacetTagSuggestionsCard({
  ai,
}: {
  ai: Record<string, unknown>;
}) {
  const plan = asRecord(ai.fiveFacetQuestionTaggingPlan);
  const suggestions = asArray(plan.suggestions).map(asRecord);

  if (!stringValue(plan.version) && !suggestions.length) {
    return null;
  }

  const planWarnings = stringList(plan.warnings);
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
          <p className="font-medium">Five-facet tag suggestions</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Planning-only suggestions for tutor review. Tags are not written to
            official records from this dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Items: {itemCount}</Badge>
          <Badge variant="outline">Valid bundles: {validBundleCount}</Badge>
          <Badge variant="outline">Warnings: {warningCount}</Badge>
          <Badge variant="outline">Ambiguous: {ambiguousSuggestionCount}</Badge>
          <Badge variant="outline">Review required: {reviewRequiredCount}</Badge>
        </div>
      </div>

      <div className="mt-3 grid gap-3">
        {suggestions.length ? (
          suggestions.slice(0, 8).map((suggestion, index) => {
            const tags = asRecord(suggestion.tags);
            const validation = asRecord(suggestion.validation);
            const warnings = suggestionWarnings(suggestion);
            const reviewRequired = suggestion.reviewRequired !== false;
            const validationStatus = booleanValue(validation.valid)
              ? "valid"
              : "needs review";

            return (
              <div
                className="rounded-md border bg-background/80 p-3"
                key={`${questionLabel(suggestion, index)}-${index}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {questionLabel(suggestion, index)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Difficulty suggestion:{" "}
                      {difficultyLabel(suggestion.difficultySuggestion)}
                      {" | "}
                      Confidence: {percentLabel(suggestion.confidence)}
                      {" | "}
                      Validation status: {validationStatus}
                    </p>
                  </div>
                  <Badge variant={reviewRequired ? "outline" : "secondary"}>
                    {reviewRequired ? "Review required" : "Review optional"}
                  </Badge>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                  {FACET_CATEGORIES.map((category) => {
                    const categoryTags = facetTags(tags, category);

                    return (
                      <div className="rounded border bg-muted/20 p-2" key={category}>
                        <p className="text-xs font-medium">
                          {titleCase(category)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {categoryTags.length ? (
                            categoryTags.map((tagId) => (
                              <span
                                className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px]"
                                key={tagId}
                              >
                                {tagId}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              None suggested
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {warnings.length ? (
                  <div className="mt-3 rounded border bg-muted/20 p-2 text-xs">
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
            );
          })
        ) : (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            No five-facet question tag suggestions were generated for this
            import.
          </p>
        )}
      </div>

      {suggestions.length > 8 ? (
        <details className="mt-3 rounded border bg-background/80 p-2 text-xs">
          <summary className="cursor-pointer font-medium">
            Show remaining suggestions (+{suggestions.length - 8})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
            {suggestions.slice(8).map((suggestion, index) => (
              <li key={`${questionLabel(suggestion, index + 8)}-${index}`}>
                {questionLabel(suggestion, index + 8)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
