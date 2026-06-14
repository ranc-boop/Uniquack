import { Badge } from "@/components/ui/badge";

export function FigureReviewCard({
  detectedFigureCountLabel,
  figureDescriptions,
  missingImageAttachmentCount,
  needsImageReview,
  sourcePageRefs,
  uploadedCropCount,
}: {
  detectedFigureCountLabel: string;
  figureDescriptions: string[];
  missingImageAttachmentCount: number;
  needsImageReview: boolean;
  sourcePageRefs: string[];
  uploadedCropCount: number;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-sm font-medium">Figure and image review</p>
      <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <p>Questions may need diagrams/images before publishing.</p>
        <p>Detected figures: {detectedFigureCountLabel}</p>
        <p>Uploaded crops: {uploadedCropCount}</p>
        <p>Missing figure attachments: {missingImageAttachmentCount}</p>
        {needsImageReview ? (
          <div>
            <Badge variant="outline">Needs media review</Badge>
          </div>
        ) : null}
        {sourcePageRefs.length ? (
          <p>Source page refs: {sourcePageRefs.join(", ")}</p>
        ) : null}
        {figureDescriptions.length ? (
          <details className="sm:col-span-2">
            <summary className="cursor-pointer font-medium text-foreground">
              Figure notes ({figureDescriptions.length})
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {figureDescriptions.slice(0, 5).map((description) => (
                <li key={description}>{description}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </div>
  );
}
