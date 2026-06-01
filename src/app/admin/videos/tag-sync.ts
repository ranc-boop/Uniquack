import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function syncVideoTagsFromQuestion({
  supabase,
  videoId,
  questionId,
}: {
  supabase: SupabaseServerClient;
  videoId: string;
  questionId: string;
}) {
  const { data: questionTags, error: questionTagsError } = await supabase
    .from("question_tags")
    .select("tag_id")
    .eq("question_id", questionId);

  if (questionTagsError) {
    throw new Error(questionTagsError.message);
  }

  const tagIds = Array.from(
    new Set((questionTags ?? []).map((binding) => binding.tag_id)),
  );

  const { error: deleteTagsError } = await supabase
    .from("video_tags")
    .delete()
    .eq("video_id", videoId);

  if (deleteTagsError) {
    throw new Error(deleteTagsError.message);
  }

  if (!tagIds.length) {
    return;
  }

  const { error: videoTagsError } = await supabase.from("video_tags").insert(
    tagIds.map((tagId) => ({
      video_id: videoId,
      tag_id: tagId,
    })),
  );

  if (videoTagsError) {
    throw new Error(videoTagsError.message);
  }
}

export async function syncBoundVideoTagsForQuestion({
  supabase,
  questionId,
}: {
  supabase: SupabaseServerClient;
  questionId: string;
}) {
  const { data: video, error: videoError } = await supabase
    .from("videos")
    .select("id")
    .eq("question_id", questionId)
    .maybeSingle();

  if (videoError) {
    throw new Error(videoError.message);
  }

  if (!video) {
    return null;
  }

  await syncVideoTagsFromQuestion({
    supabase,
    videoId: video.id,
    questionId,
  });

  return video.id;
}
