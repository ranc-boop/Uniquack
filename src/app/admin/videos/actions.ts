"use server";

import { revalidatePath } from "next/cache";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { tagIdsFormSchema } from "@/lib/validations/common";
import {
  videoCreateSchema,
  videoDeleteSchema,
  videoStatusSchema,
  videoUpdateSchema,
} from "@/lib/validations/video";

export async function createVideo(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = videoCreateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { data: video, error } = await supabase
      .from("videos")
      .insert({
        ...parsed,
        created_by: profile.id,
        updated_by: profile.id,
        published_at:
          parsed.status === "published" ? new Date().toISOString() : null,
      })
      .select("id, question_id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const { data: questionTags, error: questionTagsError } = await supabase
      .from("question_tags")
      .select("tag_id")
      .eq("question_id", video.question_id);

    if (questionTagsError) {
      throw new Error(questionTagsError.message);
    }

    if (questionTags?.length) {
      const { error: videoTagsError } = await supabase.from("video_tags").insert(
        questionTags.map((binding) => ({
          video_id: video.id,
          tag_id: binding.tag_id,
        })),
      );

      if (videoTagsError) {
        throw new Error(videoTagsError.message);
      }
    }
  } catch (error) {
    redirectWithError("/admin/videos", formatActionError(error));
  }

  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  redirectWithSaved("/admin/videos", "Video created.");
}

export async function updateVideo(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = videoUpdateSchema.parse(Object.fromEntries(formData));
    const tagIds = tagIdsFormSchema.parse(
      formData.getAll("tag_ids").map(String).filter(Boolean),
    );
    const supabase = await createClient();
    const { id, ...values } = parsed;

    const { error } = await supabase
      .from("videos")
      .update({
        ...values,
        updated_by: profile.id,
        published_at:
          values.status === "published" ? new Date().toISOString() : null,
      })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    const { error: deleteTagsError } = await supabase
      .from("video_tags")
      .delete()
      .eq("video_id", id);

    if (deleteTagsError) {
      throw new Error(deleteTagsError.message);
    }

    if (tagIds.length > 0) {
      const { error: tagError } = await supabase.from("video_tags").insert(
        tagIds.map((tagId) => ({
          video_id: id,
          tag_id: tagId,
        })),
      );

      if (tagError) {
        throw new Error(tagError.message);
      }
    }
  } catch (error) {
    redirectWithError("/admin/videos", formatActionError(error));
  }

  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  redirectWithSaved("/admin/videos", "Video updated.");
}

export async function updateVideoStatus(formData: FormData) {
  try {
    const profile = await requireAdmin();
    const parsed = videoStatusSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase
      .from("videos")
      .update({
        status: parsed.status,
        updated_by: profile.id,
        published_at:
          parsed.status === "published" ? new Date().toISOString() : null,
      })
      .eq("id", parsed.id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/videos", formatActionError(error));
  }

  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  redirectWithSaved("/admin/videos", "Video status updated.");
}

export async function deleteVideo(formData: FormData) {
  try {
    await requireAdmin();
    const parsed = videoDeleteSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();

    const { error } = await supabase.from("videos").delete().eq("id", parsed.id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/videos", formatActionError(error));
  }

  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  redirectWithSaved("/admin/videos", "Video deleted.");
}
