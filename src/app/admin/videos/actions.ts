"use server";

import { revalidatePath } from "next/cache";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
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

    const { error } = await supabase
      .from("videos")
      .insert({
        ...parsed,
        created_by: profile.id,
        updated_by: profile.id,
        published_at:
          parsed.status === "published" ? new Date().toISOString() : null,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

  } catch (error) {
    redirectWithError("/admin/videos", formatActionError(error));
  }

  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  redirectWithSaved("/admin/videos", "Video created.");
}

export async function updateVideo(formData: FormData) {
  let videoId = "";

  try {
    const profile = await requireAdmin();
    const parsed = videoUpdateSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    const { id, ...values } = parsed;
    videoId = id;

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

  } catch (error) {
    redirectWithError("/admin/videos", formatActionError(error));
  }

  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  revalidatePath(`/videos/${videoId}`);
  redirectWithSaved("/admin/videos", "Video updated.");
}

export async function updateVideoStatus(formData: FormData) {
  let videoId = "";

  try {
    const profile = await requireAdmin();
    const parsed = videoStatusSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    videoId = parsed.id;

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
  revalidatePath(`/videos/${videoId}`);
  redirectWithSaved("/admin/videos", "Video status updated.");
}

export async function deleteVideo(formData: FormData) {
  let videoId = "";

  try {
    await requireAdmin();
    const parsed = videoDeleteSchema.parse(Object.fromEntries(formData));
    const supabase = await createClient();
    videoId = parsed.id;

    const { error } = await supabase.from("videos").delete().eq("id", parsed.id);

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    redirectWithError("/admin/videos", formatActionError(error));
  }

  revalidatePath("/admin/videos");
  revalidatePath("/videos");
  revalidatePath(`/videos/${videoId}`);
  redirectWithSaved("/admin/videos", "Video deleted.");
}
