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
    <div className="grid gap-2 rounded-lg border bg-muted/10 p-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
      <div className="min-w-0 rounded-md bg-background px-3 py-2" title={`${providerName} · ${providerModeLabel}`}>
        <p className="text-lg font-semibold leading-6">{providerName}</p>
        <p className="truncate text-xs text-muted-foreground">Provider</p>
      </div>
      <div className="min-w-0 rounded-md bg-background px-3 py-2" title={`${model} · ${inputStrategyLabel}`}>
        <p className="truncate text-lg font-semibold leading-6">{model}</p>
        <p className="truncate text-xs text-muted-foreground">Model</p>
      </div>
      <div className="min-w-0 rounded-md bg-background px-3 py-2" title={`${sourceFilename} · ${sizeLabel}`}>
        <p className="text-lg font-semibold leading-6">{pageCountLabel}</p>
        <p className="truncate text-xs text-muted-foreground">Pages · {sourceFilename}</p>
      </div>
      <div className="min-w-0 rounded-md bg-background px-3 py-2" title={`Assets ${sourceAsset ? 1 : 0} · crops ${uploadedCropCount} · chunks ${chunkCount ?? "-"}`}>
        <p className="text-lg font-semibold leading-6">{createdQuestionCount}</p>
        <p className="truncate text-xs text-muted-foreground">
          Drafts · {warningCount} warnings
        </p>
      </div>
    </div>
  );
}
