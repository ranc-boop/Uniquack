"use client";

import dynamic from "next/dynamic";

const PackageImportPanel = dynamic(
  () =>
    import("@/components/package-import-panel").then(
      (module) => module.PackageImportPanel,
    ),
  {
    loading: () => (
      <div className="rounded-md border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
        Loading package import controls...
      </div>
    ),
    ssr: false,
  },
);

export function PackageImportPanelLoader() {
  return <PackageImportPanel />;
}
