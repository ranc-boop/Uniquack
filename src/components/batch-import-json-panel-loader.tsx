"use client";

import dynamic from "next/dynamic";

type BatchImportJsonPanelLoaderProps = {
  tagIds?: string[];
};

const BatchImportJsonPanel = dynamic<BatchImportJsonPanelLoaderProps>(
  () =>
    import("@/components/batch-import-json-panel").then(
      (module) => module.BatchImportJsonPanel,
    ),
  {
    loading: () => (
      <div className="rounded-md border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
        Loading JSON import editor...
      </div>
    ),
    ssr: false,
  },
);

export function BatchImportJsonPanelLoader(
  props: BatchImportJsonPanelLoaderProps,
) {
  return <BatchImportJsonPanel {...props} />;
}
