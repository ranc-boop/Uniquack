"use client";

import dynamic from "next/dynamic";

import { ImportPanelLoadingSkeleton } from "@/components/import-panel-loading-skeleton";
import { LoadingIndicator } from "@/components/loading-indicator";
import type {
  BulkAssetExistingFilesByQuestionId,
  BulkAssetQuestionMatch,
} from "@/lib/bulk-asset-import/matching";

type BulkAssetUploadPanelLoaderProps = {
  draftQuestions: BulkAssetQuestionMatch[];
  existingFilesByQuestionId: BulkAssetExistingFilesByQuestionId;
};

const BulkAssetUploadPanel = dynamic<BulkAssetUploadPanelLoaderProps>(
  () =>
    import("@/components/bulk-asset-upload-panel").then(
      (module) => module.BulkAssetUploadPanel,
    ),
  {
    loading: () => (
      <div className="space-y-3">
        <LoadingIndicator label="Loading bulk asset matcher..." />
        <ImportPanelLoadingSkeleton variant="assets" />
      </div>
    ),
    ssr: false,
  },
);

export function BulkAssetUploadPanelLoader(
  props: BulkAssetUploadPanelLoaderProps,
) {
  return <BulkAssetUploadPanel {...props} />;
}
