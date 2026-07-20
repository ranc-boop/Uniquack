import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { callPracticeJsonModel, loadPracticeAIProfile } from "@/lib/practice/ai";
import { buildUsageEnvelope, compactText, stableStringify, writePracticeStatsLog } from "@/lib/practice/context";
import { loadPracticePrompt } from "@/lib/practice/prompt-loader";
import { logPracticeProviderFailure } from "@/lib/practice/provider-safety";
import {
  countPendingPreferenceJobs,
  getOrCreatePracticePreference,
} from "@/lib/practice/persistence";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MergeResponse = {
  long_term_preference?: string;
};

export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return auth.response;
  }

  const jobResult = await supabase
    .from("practice_preference_merge_jobs")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (jobResult.error) {
    const failure = logPracticeProviderFailure({
      error: jobResult.error,
      operation: "practice_preference_merge_lookup",
    });
    return NextResponse.json({
      code: failure.code,
      correlationId: failure.correlationId,
      error: failure.message,
    }, { status: 500 });
  }

  if (!jobResult.data) {
    const preference = await getOrCreatePracticePreference({ supabase, userId: auth.user.id });
    const pendingMergeCount = await countPendingPreferenceJobs({ supabase, userId: auth.user.id });
    return NextResponse.json({
      lastAgentUpdatedAt: preference.last_agent_updated_at,
      longTermPreference: preference.long_term_preference,
      pendingMergeCount,
      status: "idle",
    });
  }

  const job = jobResult.data as {
    id: string;
    organization_id: string | null;
    previous_preference: string;
    source_session_id: string | null;
    source_session_memory: string;
    source_summary?: unknown;
  };

  const claimed = await supabase
    .from("practice_preference_merge_jobs")
    .update({
      claimed_at: new Date().toISOString(),
      status: "running",
    })
    .eq("user_id", auth.user.id)
    .eq("id", job.id)
    .eq("status", "pending");

  if (claimed.error) {
    const failure = logPracticeProviderFailure({
      error: claimed.error,
      operation: "practice_preference_merge_claim",
    });
    return NextResponse.json({
      code: failure.code,
      correlationId: failure.correlationId,
      error: failure.message,
    }, { status: 500 });
  }

  try {
    const { data: recentEpisodes, error: recentEpisodesError } = await supabase
      .from("practice_agent_episodes")
      .select("episode_index,episode_card,memory_update,review_diagnosis,student_attempt_summary")
      .eq("user_id", auth.user.id)
      .eq("session_id", job.source_session_id ?? "")
      .order("episode_index", { ascending: false })
      .limit(8);

    if (recentEpisodesError) {
      throw new Error(recentEpisodesError.message);
    }

    const profile = await loadPracticeAIProfile({
      organizationId: job.organization_id ?? null,
      requestId: `preference-merge:${job.id}`,
    });
    const systemPrompt = await loadPracticePrompt("preference-merge-system");
    const aiResult = await callPracticeJsonModel<MergeResponse>({
      debugContext: { phase: "preference_merge", sourceSessionId: job.source_session_id },
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: stableStringify({
            merge_policy: "Update only durable user-managed learning memory. Use goals, wrong/correct evidence, user option choices, review notes, and outline/next-round notes. Do not store one-off mistakes.",
            previous_long_term_preference: compactText(job.previous_preference, 1000),
            recent_episode_evidence: (recentEpisodes ?? []).map((episode) => ({
              episode_card: compactText(stableStringify(episode.episode_card ?? {}), 1800),
              episode_index: episode.episode_index,
              memory_update: compactText(episode.memory_update, 900),
              review_diagnosis: compactText(stableStringify(episode.review_diagnosis ?? {}), 1400),
              student_attempt_summary: compactText(stableStringify(episode.student_attempt_summary ?? []), 1000),
            })),
            source_session_memory: compactText(job.source_session_memory, 1600),
            source_summary: job.source_summary ?? {},
          }),
        },
      ],
      profile,
    });
    if (aiResult.usage) {
      const usageEnvelope = buildUsageEnvelope({
        cachePrefixVersion: "practice-memory-merge-v1",
        phase: "memory_merge",
        providerLabel: aiResult.providerLabel,
        suffixPayload: { sourceSessionId: job.source_session_id },
        usage: aiResult.usage,
      });
      void writePracticeStatsLog({
        context: { phase: "memory_merge", sourceSessionId: job.source_session_id },
        payload: usageEnvelope,
      });
    }

    const nextPreference = compactText(aiResult.parsed.long_term_preference, 1000);

    const preferenceResult = await supabase
      .from("user_practice_preferences")
      .upsert(
        {
          last_agent_updated_at: new Date().toISOString(),
          long_term_preference: nextPreference,
          user_id: auth.user.id,
        },
        { onConflict: "user_id" },
      )
      .select("long_term_preference,last_agent_updated_at")
      .single();

    if (preferenceResult.error) {
      throw new Error(preferenceResult.error.message);
    }

    const finished = await supabase
      .from("practice_preference_merge_jobs")
      .update({
        completed_at: new Date().toISOString(),
        result_preference: nextPreference,
        status: "succeeded",
      })
      .eq("user_id", auth.user.id)
      .eq("id", job.id);

    if (finished.error) {
      throw new Error(finished.error.message);
    }

    if (job.source_session_id) {
      await supabase
        .from("practice_sessions")
        .update({ preference_dirty_at: null, preference_merged_at: new Date().toISOString() })
        .eq("user_id", auth.user.id)
        .eq("id", job.source_session_id);
    }

    const pendingMergeCount = await countPendingPreferenceJobs({ supabase, userId: auth.user.id });
    return NextResponse.json({
      lastAgentUpdatedAt: preferenceResult.data.last_agent_updated_at,
      longTermPreference: preferenceResult.data.long_term_preference,
      pendingMergeCount,
      status: "succeeded",
    });
  } catch (error) {
    const failure = logPracticeProviderFailure({
      error,
      operation: "practice_preference_merge",
    });
    await supabase
      .from("practice_preference_merge_jobs")
      .update({
        completed_at: new Date().toISOString(),
        error_message: failure.code,
        status: "failed",
      })
      .eq("user_id", auth.user.id)
      .eq("id", job.id);

    return NextResponse.json({
      code: failure.code,
      correlationId: failure.correlationId,
      error: failure.message,
      status: "failed",
    }, { status: 500 });
  }
}
