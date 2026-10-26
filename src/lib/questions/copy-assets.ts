import "server-only";

import { randomUUID } from "node:crypto";

import { QUESTION_ASSETS_BUCKET } from "@/lib/question-assets";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type CopyableQuestionAsset = {
  alt_text: string | null;
  asset_kind: string;
  display_order: number;
  id?: string;
  label: string | null;
  storage_bucket: string;
  storage_path: string;
};

type CopiedQuestionAsset = {
  altText: string;
  assetId: string;
  bucket: string;
  displayOrder: number;
  label: string;
  path: string;
  sourceAssetId: string;
};

function safeFileName(path: string) {
  const name = path.split("/").pop() || "image";
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
}

export async function copyQuestionAssetsForIndependentUse({
  assets,
  destinationPrefix,
}: {
  assets: CopyableQuestionAsset[];
  destinationPrefix: string;
}) {
  const service = createServiceRoleClient();
  const copied: CopiedQuestionAsset[] = [];

  try {
    for (const asset of assets) {
      if (
        asset.asset_kind !== "image" ||
        asset.storage_bucket !== QUESTION_ASSETS_BUCKET
      ) {
        throw new Error(
          "Only reviewed images in the private question-assets bucket can be copied.",
        );
      }

      if (!asset.id) {
        throw new Error("A reviewed image is missing its source asset ID.");
      }

      const assetId = randomUUID();
      const destinationPath = [
        destinationPrefix.replace(/^\/+|\/+$/g, ""),
        assetId,
        safeFileName(asset.storage_path),
      ].join("/");
      const { error } = await service.storage
        .from(QUESTION_ASSETS_BUCKET)
        .copy(asset.storage_path, destinationPath);

      if (error) {
        throw new Error(`Could not copy ${safeFileName(asset.storage_path)}.`);
      }

      copied.push({
        altText: asset.alt_text ?? "",
        assetId,
        bucket: QUESTION_ASSETS_BUCKET,
        displayOrder: asset.display_order,
        label: asset.label ?? "",
        path: destinationPath,
        sourceAssetId: asset.id,
      });
    }
  } catch (error) {
    if (copied.length) {
      await service.storage
        .from(QUESTION_ASSETS_BUCKET)
        .remove(copied.map((asset) => asset.path));
    }
    throw error;
  }

  return {
    assets: copied,
    async cleanup() {
      if (!copied.length) return;
      await service.storage
        .from(QUESTION_ASSETS_BUCKET)
        .remove(copied.map((asset) => asset.path));
    },
  };
}
