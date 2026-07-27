"use client";

import dynamic from "next/dynamic";

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
      <div className="rounded-md border bg-muted/20 px-3 py-4">
        <LoadingIndicator label="Loading JSON import editor..." />
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
