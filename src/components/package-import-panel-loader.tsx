"use client";

import dynamic from "next/dynamic";

import { ImportPanelLoadingSkeleton } from "@/components/import-panel-loading-skeleton";
import { LoadingIndicator } from "@/components/loading-indicator";

const PackageImportPanel = dynamic(
  () =>
    import("@/components/package-import-panel").then(
      (module) => module.PackageImportPanel,
    ),
  {
    loading: () => (
      <div className="space-y-3">
        <LoadingIndicator label="Loading package import controls..." />
        <ImportPanelLoadingSkeleton variant="package" />
      </div>
    ),
    ssr: false,
  },
);

export function PackageImportPanelLoader() {
  return <PackageImportPanel />;
}
