"use client";

import dynamic from "next/dynamic";

import type { AIPdfImportPanelProps } from "@/components/ai-pdf-import-panel";

const AIPdfImportPanel = dynamic<AIPdfImportPanelProps>(
  () =>
    import("@/components/ai-pdf-import-panel").then(
      (module) => module.AIPdfImportPanel,
    ),
  {
    loading: () => (
      <div className="rounded-md border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
        Loading AI PDF import controls...
      </div>
    ),
    ssr: false,
  },
);

export function AIPdfImportPanelLoader(props: AIPdfImportPanelProps) {
  return <AIPdfImportPanel {...props} />;
}
