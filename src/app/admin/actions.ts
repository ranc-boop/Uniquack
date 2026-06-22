"use server";

import { revalidatePath } from "next/cache";

import {
  formatActionError,
  redirectWithError,
  redirectWithSaved,
} from "@/lib/actions/feedback";
import { requireAdmin } from "@/lib/auth/guards";
import { sanitizeContentHtml } from "@/lib/sanitize/html";
import { createClient } from "@/lib/supabase/server";

export async function createDemoContent() {
  try {
    const profile = await requireAdmin();
    const supabase = await createClient();

    const { data: existingQuestion, error: questionSelectError } = await supabase
      .from("questions")
      .select("id")
      .eq("question_code", "DEMO-AP-PHYS-001")
      .maybeSingle();

    if (questionSelectError) {
      throw new Error(questionSelectError.message);
    }

    let questionId = existingQuestion?.id;

    if (!questionId) {
      const { data: question, error: questionError } = await supabase
        .from("questions")
        .insert({
          question_code: "DEMO-AP-PHYS-001",
          title: "AP Physics: Constant acceleration reasoning",
          content_html: sanitizeContentHtml(
            "<p>A cart starts from rest and accelerates uniformly along a track. Explain how the velocity-time graph supports the claim that acceleration is constant.</p>",
          ),
          solution_html: sanitizeContentHtml(
            "<p>The slope of a velocity-time graph is acceleration. A straight line with constant slope indicates constant acceleration.</p>",
          ),
          question_type: "frq",
          difficulty_rating: 540,
          status: "published",
          created_by: profile.id,
          updated_by: profile.id,
          published_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (questionError) {
        throw new Error(questionError.message);
      }

      questionId = question.id;
    }

    const { data: existingVideo, error: videoSelectError } = await supabase
      .from("videos")
      .select("id")
      .eq("question_id", questionId)
      .maybeSingle();

    if (videoSelectError) {
      throw new Error(videoSelectError.message);
    }

    let videoId = existingVideo?.id;

    if (!videoId) {
      const { data: video, error: videoError } = await supabase
        .from("videos")
        .insert({
          question_id: questionId,
          title: "AP Physics demo explanation",
          video_url: "https://www.youtube.com/watch?v=ysz5S6PUM-U",
          embed_url: "https://www.youtube.com/embed/ysz5S6PUM-U",
          thumbnail_url: "https://img.youtube.com/vi/ysz5S6PUM-U/hqdefault.jpg",
          provider: "YouTube",
          status: "published",
          created_by: profile.id,
          updated_by: profile.id,
          published_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (videoError) {
        throw new Error(videoError.message);
      }

      videoId = video.id;
    }

    void videoId;
  } catch (error) {
    redirectWithError("/admin", formatActionError(error));
  }

  revalidatePath("/admin");
  revalidatePath("/admin/tags");
  revalidatePath("/admin/questions");
  revalidatePath("/admin/videos");
  revalidatePath("/questions");
  revalidatePath("/videos");
  redirectWithSaved("/admin", "Demo AP Physics content is ready.");
}
