"use client";

import dynamic from "next/dynamic";

import type { AIPdfImportPanelProps } from "@/components/ai-pdf-import-panel";
import { ImportPanelLoadingSkeleton } from "@/components/import-panel-loading-skeleton";
import { LoadingIndicator } from "@/components/loading-indicator";

const AIPdfImportPanel = dynamic<AIPdfImportPanelProps>(
  () =>
    import("@/components/ai-pdf-import-panel").then(
      (module) => module.AIPdfImportPanel,
    ),
  {
    loading: () => (
      <div className="space-y-3">
        <LoadingIndicator label="Loading AI PDF import controls..." />
        <ImportPanelLoadingSkeleton variant="pdf" />
      </div>
    ),
    ssr: false,
  },
);

export function AIPdfImportPanelLoader(props: AIPdfImportPanelProps) {
  return <AIPdfImportPanel {...props} />;
}
