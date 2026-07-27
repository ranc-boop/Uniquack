"use client";

import dynamic from "next/dynamic";

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
      <div className="rounded-md border bg-muted/20 px-3 py-4">
        <LoadingIndicator label="Loading bulk asset matcher..." />
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
