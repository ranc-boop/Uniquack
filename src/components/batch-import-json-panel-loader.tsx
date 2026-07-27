"use client";

import dynamic from "next/dynamic";

import { ImportPanelLoadingSkeleton } from "@/components/import-panel-loading-skeleton";
import { LoadingIndicator } from "@/components/loading-indicator";
import type {
  JsonImportCommitAction,
  JsonImportPreviewAction,
} from "@/components/batch-import-json-panel";
import type {
  QuestionWorkspaceCapabilities,
  QuestionWorkspaceScope,
} from "@/lib/questions/workspace";

type BatchImportJsonPanelLoaderProps = {
  capabilities: QuestionWorkspaceCapabilities;
  importAction: JsonImportCommitAction;
  previewAction: JsonImportPreviewAction;
  questionsHref: string;
  resultDescription: string;
  reviewHref: string;
  scope: QuestionWorkspaceScope;
  scopeLabel: string;
  tagIds?: string[];
};

const BatchImportJsonPanel = dynamic<BatchImportJsonPanelLoaderProps>(
  () =>
    import("@/components/batch-import-json-panel").then(
      (module) => module.BatchImportJsonPanel,
    ),
  {
    loading: () => (
      <div className="space-y-3">
        <LoadingIndicator label="Loading JSON import editor..." />
        <ImportPanelLoadingSkeleton variant="json" />
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
