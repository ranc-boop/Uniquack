type SourceAssetSummary = {
  original_filename?: string | null;
};

export function ProviderSummaryCards({
  chunkCount,
  createdQuestionCount,
  inputStrategyLabel,
  model,
  pageCountLabel,
  providerModeLabel,
  providerName,
  sizeLabel,
  sourceAsset,
  sourceFilename,
  uploadedCropCount,
  warningCount,
}: {
  chunkCount?: number;
  createdQuestionCount: number;
  inputStrategyLabel: string;
  model: string;
  pageCountLabel: string;
  providerModeLabel: string;
  providerName: string;
  sizeLabel: string;
  sourceAsset?: SourceAssetSummary | null;
  sourceFilename: string;
  uploadedCropCount: number;
  warningCount: number;
}) {
  return (
    <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
      <div className="min-w-0 rounded-md border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">Provider</p>
        <p className="break-words font-medium">{providerName}</p>
        <p className="text-xs text-muted-foreground">{providerModeLabel}</p>
      </div>
      <div className="min-w-0 rounded-md border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">Model</p>
        <p className="break-words font-medium">{model}</p>
        <p className="text-xs text-muted-foreground">
          Input: {inputStrategyLabel}
        </p>
      </div>
      <div className="min-w-0 rounded-md border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">Source / pages</p>
        <p className="break-words font-medium" title={sourceFilename}>
          {sourceFilename}
        </p>
        <p className="text-xs text-muted-foreground">
          Pages processed: {pageCountLabel} / {sizeLabel}
        </p>
      </div>
      <div className="min-w-0 rounded-md border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">Outputs</p>
        <div className="mt-1 space-y-1 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Drafts:</span>{" "}
            {createdQuestionCount}
          </p>
          <p>Source assets: {sourceAsset ? 1 : 0}</p>
          <p>Question assets: {uploadedCropCount}</p>
          <p>Uploaded crops: {uploadedCropCount}</p>
          <p>
            Warnings: {warningCount} / Chunks:{" "}
            {chunkCount !== undefined ? chunkCount : "-"}
          </p>
        </div>
      </div>
    </div>
  );
}
