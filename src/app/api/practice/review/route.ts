import { NextResponse } from "next/server";

import { updateLinkedAssignmentProgressAfterPractice } from "@/lib/practice/assignment-linkage";
import { requirePracticeApiUser } from "@/lib/practice/auth";
import { callPracticeChatModelStream, callPracticeJsonModel, loadPracticeAIProfile } from "@/lib/practice/ai";
import { buildUsageEnvelope, compactText, stableHash, stableStringify, summarizeLLMUsage, traced, writePracticeStatsLog } from "@/lib/practice/context";
import {
  CURRENT_PRACTICE_SESSION_SCHEMA_VERSION,
  getOrCreatePracticePreference,
  persistQuestionReviewResults,
  persistRoundReviewSummary,
} from "@/lib/practice/persistence";
import { logPracticeProviderFailure } from "@/lib/practice/provider-safety";
import { canonicalPracticeSourceQuestionId } from "@/lib/practice/question-identity";
import { loadPracticePrompt } from "@/lib/practice/prompt-loader";
import {
  isCurrentPracticeQuestionSnapshot,
  PRACTICE_SESSION_EXPIRED_MESSAGE,
} from "@/lib/practice/schema";
import type {
  PracticeGradeResult,
  PracticeQuestionReview,
  PracticeRecommendation,
  PracticeReviewRequest,
  PracticeReviewResponse,
  PracticeTraceEvent,
} from "@/lib/practice/types";
import { loadQuestionsForReview } from "@/lib/practice/tools";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AIQuestionReviewResponse = {
  is_correct?: boolean | null;
  judgment_reason?: string;
  question_id?: string;
  score?: number | null;
  solution_key_points?: string;
  student_answer?: string | string[];
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function boundedRoundReviewMarkdown(value: unknown, maxLength = 2400) {
  const normalized = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}\n\n…`;
}

function normalizeRoundReviewSummary(value: string) {
  const trimmed = value.trim();
  const candidate = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(candidate);
    const record = asObject(parsed);
    if (typeof record.summary === "string" && record.summary.trim()) {
      return boundedRoundReviewMarkdown(record.summary);
    }
  } catch {
    // Plain-text summaries remain valid.
  }

  return boundedRoundReviewMarkdown(trimmed);
}

function answerText(value: unknown) {
  return Array.isArray(value) ? value.map(String).join(", ") : String(value ?? "");
}

function compactAnswerSpec(value: unknown) {
  if (!value) return null;
  try {
    return compactText(stableStringify(value), 900);
  } catch {
    return compactText(String(value), 900);
  }
}

function optionText(options: unknown) {
  if (!Array.isArray(options)) return [];

  return options.slice(0, 8).map((option) => {
    const item = option && typeof option === "object" ? (option as Record<string, unknown>) : {};
    return {
      content: compactText(String(item.content_html ?? item.content ?? ""), 260),
      id: String(item.id ?? ""),
      label: String(item.label ?? ""),
    };
  });
}

function recommendationFromRoundQuestion(row: Record<string, unknown>): PracticeRecommendation | null {
  if (!isCurrentPracticeQuestionSnapshot(row.question_snapshot)) {
    return null;
  }

  const snapshot = row.question_snapshot as Partial<PracticeRecommendation>;
  const sourceQuestionId = String(row.source_question_id ?? snapshot.sourceQuestionId ?? snapshot.id ?? "").trim();

  if (!sourceQuestionId) {
    return null;
  }

  return {
    contentExcerpt: String(snapshot.contentExcerpt ?? ""),
    contentHtml: String(snapshot.contentHtml ?? ""),
    difficulty: Number(snapshot.difficulty ?? 0),
    expectedSkill: String(snapshot.expectedSkill ?? ""),
    id: sourceQuestionId,
    options: Array.isArray(snapshot.options) ? snapshot.options : [],
    questionCode: String(snapshot.questionCode ?? "snapshot"),
    questionType: (snapshot.questionType ?? "mixed") as PracticeRecommendation["questionType"],
    reason: String(snapshot.reason ?? ""),
    source: snapshot.source,
    sourceQuestionId,
    tagIds: Array.isArray(snapshot.tagIds) ? snapshot.tagIds : [],
    title: String(snapshot.title ?? "Saved question"),
  };
}

function normalizeQuestionReview({
  attempt,
  parsed,
  solutionHtml,
}: {
  attempt: PracticeReviewRequest["attempts"][number];
  parsed: AIQuestionReviewResponse;
  solutionHtml: string | null | undefined;
}): { result: PracticeGradeResult; review: PracticeQuestionReview } {
  const isCorrect = typeof parsed.is_correct === "boolean" ? parsed.is_correct : parsed.is_correct === null ? null : null;
  const score = typeof parsed.score === "number"
    ? Math.max(0, Math.min(1, parsed.score))
    : isCorrect === true
      ? 1
      : isCorrect === false
        ? 0
        : null;
  const judgmentReason =
    compactText(parsed.judgment_reason ?? "", 900) ||
    "The reviewer did not provide a judgment reason.";
  const solutionKeyPoints = compactText(parsed.solution_key_points ?? "", 700) || null;
  const verdict = isCorrect === true ? "correct" : isCorrect === false ? "incorrect" : "needs review";

  return {
    result: {
      acceptedAnswers: attempt.result.acceptedAnswers,
      correctOptionIds: attempt.result.correctOptionIds,
      explanation: judgmentReason,
      gradingMode: "manual",
      isCorrect,
      questionId: attempt.questionId,
      score,
      solutionHtml: solutionHtml ?? attempt.result.solutionHtml ?? null,
    },
    review: {
      isCorrect,
      judgmentReason,
      observedError: judgmentReason,
      questionId: attempt.questionId,
      score,
      solutionKeyPoints,
      studentAnswer: parsed.student_answer ?? attempt.answer,
      verdict,
    },
  };
}

function sseEncode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function wantsEventStream(request: Request) {
  return request.headers.get("accept")?.includes("text/event-stream") ?? false;
}

const REVIEW_CONCURRENCY = 3;

function buildQuestionThreadText(questionReviews: PracticeQuestionReview[], recommendations: PracticeRecommendation[]) {
  const questionById = new Map(
    recommendations.map((question) => [canonicalPracticeSourceQuestionId(question), question]),
  );
  return questionReviews.map((review, index) => {
    const question = questionById.get(review.questionId);
    const label = question?.questionCode || `Question ${index + 1}`;
    const verdict = review.isCorrect === true ? "correct" : review.isCorrect === false ? "incorrect" : "needs review";
    return `${label}: student answered "${compactText(answerText(review.studentAnswer), 220) || "(blank)"}"; verdict ${verdict}; reason: ${compactText(review.judgmentReason ?? "", 420)}.`;
  }).join("\n");
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const auth = await requirePracticeApiUser(supabase);
  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json()) as PracticeReviewRequest;
  const goal = (body.goal ?? "").trim().slice(0, 500);
  const sessionId = (body.sessionId ?? "").trim();
  const roundId = (body.roundId ?? "").trim();

  if (!goal) {
    return NextResponse.json({ error: "Practice goal is required." }, { status: 400 });
  }
  if (!sessionId || !roundId) {
    return NextResponse.json({ error: "sessionId and roundId are required." }, { status: 400 });
  }

  if (!wantsEventStream(request)) {
    return NextResponse.json(
      { error: "Practice review now requires an event-stream client." },
      { status: 406 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const trace: PracticeTraceEvent[] = [];
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEncode(event, data)));
      };

      try {
        const { data: roundQuestions, error: roundQuestionsError } = await supabase
          .from("practice_round_questions")
          .select("*")
          .eq("user_id", auth.user.id)
          .eq("session_id", sessionId)
          .eq("round_id", roundId)
          .order("position", { ascending: true });

        if (roundQuestionsError) throw new Error(roundQuestionsError.message);

        const { data: sessionRecord, error: sessionRecordError } = await supabase
          .from("practice_sessions")
          .select("cache_prefix_version,course_framework_snapshot,long_term_memory_snapshot,outline_user_notes,next_user_notes,session_plan,session_thread_messages")
          .eq("user_id", auth.user.id)
          .eq("id", sessionId)
          .maybeSingle();

        if (sessionRecordError) throw new Error(sessionRecordError.message);
        if (!sessionRecord) throw new Error("Practice session not found.");
        if (sessionRecord.cache_prefix_version !== CURRENT_PRACTICE_SESSION_SCHEMA_VERSION) {
          throw new Error(PRACTICE_SESSION_EXPIRED_MESSAGE);
        }

        const { data: episodeRecord, error: episodeRecordError } = await supabase
          .from("practice_agent_episodes")
          .select("round_contract,cache_thread_entry")
          .eq("user_id", auth.user.id)
          .eq("round_id", roundId)
          .maybeSingle();

        if (episodeRecordError) throw new Error(episodeRecordError.message);

        const attempts = body.attempts ?? [];
        if (!attempts.length) throw new Error("No attempts submitted.");

        const persistedRecommendations = ((roundQuestions ?? []) as Record<string, unknown>[])
          .map(recommendationFromRoundQuestion)
          .filter((question): question is PracticeRecommendation => Boolean(question?.id));
        const recommendationById = new Map<string, any>((body.recommendations ?? []).map((question) => [String(question.id), question]));
        const preference = await getOrCreatePracticePreference({ supabase, userId: auth.user.id });
        const lockedLongTermMemory = String(sessionRecord.long_term_memory_snapshot ?? "").trim() ||
          preference.long_term_preference.trim();
        if (!String(sessionRecord.long_term_memory_snapshot ?? "").trim() && lockedLongTermMemory) {
          await supabase
            .from("practice_sessions")
            .update({ long_term_memory_snapshot: lockedLongTermMemory.slice(0, 1000) })
            .eq("user_id", auth.user.id)
            .eq("id", sessionId);
        }

        const questionIds = Array.from(new Set(attempts.map((attempt) => attempt.questionId).filter(Boolean)));
        const reviewQuestions = await loadQuestionsForReview({ questionIds, supabase }) as any[];
        const questionById = new Map<string, any>(reviewQuestions.map((question) => [String(question.id), question]));
        const solutionByQuestionId = new Map<string, string | null | undefined>(
          reviewQuestions.map((question) => [String(question.id), question.solution_html]),
        );
        const sessionThreadMessages = Array.isArray(sessionRecord.session_thread_messages)
          ? sessionRecord.session_thread_messages.slice(-24)
          : [];
        const cachePrefixVersion = CURRENT_PRACTICE_SESSION_SCHEMA_VERSION;
        const profile = await loadPracticeAIProfile({
          requestId: `review:${sessionId}:${roundId}`,
        });
        const systemPrompt = await loadPracticePrompt("review-system");
        const usageEnvelopes: Record<string, unknown>[] = [];

        trace.push({
          inputSummary: "Two-stage review context: per-question reviewer first, main-thread round summary second.",
          outputSummary: `thread_entries=${sessionThreadMessages.length}; attempts=${attempts.length}; prefix_hash=${stableHash({ sessionPlan: sessionRecord.session_plan, sessionThreadMessages })}`,
          phase: "context",
          toolName: "compact_review_context",
        });
        send("trace", trace[trace.length - 1]);

        const resultsByIndex: Array<PracticeGradeResult | undefined> =
          new Array(attempts.length);
        const questionReviewsByIndex: Array<
          PracticeQuestionReview | undefined
        > = new Array(attempts.length);
        let nextAttemptIndex = 0;
        let reviewFailure: unknown = null;

        async function reviewNextAttempt() {
          while (!reviewFailure) {
            const index = nextAttemptIndex;
            nextAttemptIndex += 1;
            if (index >= attempts.length) return;

            const attempt = attempts[index];
            try {
              const stored = questionById.get(attempt.questionId);
              const recommended = recommendationById.get(attempt.questionId);
              const reviewInput = {
                answer_spec: compactAnswerSpec(stored?.answer_spec),
                hint_count: attempt.hintCount ?? 0,
                options: optionText(stored?.options ?? recommended?.options),
                question_code:
                  stored?.question_code ??
                  recommended?.questionCode ??
                  attempt.questionCode,
                question_id: attempt.questionId,
                question_type:
                  stored?.question_type ?? recommended?.questionType,
                solution: compactText(stored?.solution_html, 1400),
                stem: compactText(
                  stored?.content_html ?? recommended?.contentHtml,
                  1400,
                ),
                student_answer: attempt.answer,
                task_type: "single_question_correctness_review",
                title: compactText(
                  stored?.title ?? recommended?.title ?? attempt.title,
                  180,
                ),
              };

              const started = Date.now();
              const aiResult =
                await callPracticeJsonModel<AIQuestionReviewResponse>({
                  debugContext: {
                    phase: "review",
                    questionId: attempt.questionId,
                    roundId,
                    sessionId,
                  },
                  profile,
                  messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: stableStringify(reviewInput) },
                  ],
                });
              if (aiResult.usage) {
                const usageEnvelope = buildUsageEnvelope({
                  cachePrefixVersion,
                  phase: "review",
                  prefixPayload: { reviewPrompt: "single-question-review" },
                  providerLabel: aiResult.providerLabel,
                  suffixPayload: reviewInput,
                  usage: aiResult.usage,
                });
                usageEnvelopes.push(usageEnvelope);
                void writePracticeStatsLog({
                  context: {
                    phase: "review",
                    questionId: attempt.questionId,
                    roundId,
                    sessionId,
                  },
                  payload: usageEnvelope,
                });
              }
              const normalized = normalizeQuestionReview({
                attempt,
                parsed: {
                  ...aiResult.parsed,
                  question_id: attempt.questionId,
                },
                solutionHtml: solutionByQuestionId.get(attempt.questionId),
              });
              resultsByIndex[index] = normalized.result;
              questionReviewsByIndex[index] = normalized.review;
              const event: PracticeTraceEvent = {
                elapsedMs: Date.now() - started,
                inputSummary: `Reviewed ${attempt.questionId}`,
                outputSummary: `${normalized.review.verdict}: ${compactText(normalized.review.judgmentReason ?? "", 160)}`,
                phase: "review",
                toolName: "question_review",
              };
              trace.push(event);
              send("trace", event);
              send("question_review", {
                result: normalized.result,
                review: normalized.review,
              });
            } catch (error) {
              reviewFailure ??= error;
            }
          }
        }

        const workerCount = Math.min(REVIEW_CONCURRENCY, attempts.length);
        await Promise.all(
          Array.from({ length: workerCount }, () => reviewNextAttempt()),
        );
        if (reviewFailure) throw reviewFailure;

        const results = resultsByIndex.filter(
          (result): result is PracticeGradeResult => Boolean(result),
        );
        const questionReviews = questionReviewsByIndex.filter(
          (review): review is PracticeQuestionReview => Boolean(review),
        );

        await persistQuestionReviewResults({
          attempts,
          hintsByQuestionId: body.hintsByQuestionId,
          llmUsage: usageEnvelopes,
          providerLabel: profile.name ? `${profile.name} / ${profile.model}` : profile.model,
          questionReviews,
          recommendations: persistedRecommendations,
          results,
          roundId,
          sessionId,
          supabase,
          trace,
          userId: auth.user.id,
        });
        await updateLinkedAssignmentProgressAfterPractice({
          attemptedQuestionIds: attempts.map((attempt) => attempt.questionId),
          results,
          roundId,
          sessionId,
          supabase,
          userId: auth.user.id,
        });
        send("question_reviews_saved", { count: questionReviews.length });

        const stableThreadMessages = sessionThreadMessages.filter((entry) => {
          const item = asObject(entry);
          return !(item.kind === "current_task" && item.round_id === roundId);
        });
        const threadMessages = stableThreadMessages.map((entry, index) => ({
          content: typeof asObject(entry).text === "string" ? String(asObject(entry).text) : stableStringify(entry),
          name: `practice_thread_${index + 1}`,
          role: "assistant" as const,
        }));
        const questionReviewText = buildQuestionThreadText(questionReviews, persistedRecommendations);
        const roundReviewPrompt = [
          "You are the O2I Practice main thread. This call is only for a round review summary.",
          "Do not call tools. Do not select next questions. Do not create a plan node. Do not update memory.",
          "Return concise Markdown prose. Short paragraphs, bold labels, and bullet lists are allowed. Do not wrap the summary in JSON, Markdown fences, or a round_review object.",
          "Use the existing practice thread plus the current question judgments to write a concise coaching summary for the frontend.",
          "Include: overall performance, what is stable, what still needs practice, and a next focus direction without choosing questions.",
          "",
          `Current goal: ${goal}`,
          `User next-round note: ${String(body.userNextRoundNote ?? sessionRecord.next_user_notes ?? "").trim() || "(none)"}`,
          `Current round task: ${stableStringify(episodeRecord?.cache_thread_entry ?? {})}`,
          "Current question judgments:",
          questionReviewText,
        ].join("\n");

        send("round_review_start", {});
        const roundReviewStream: {
          mode: "plain" | "structured" | "unknown";
          probe: string;
        } = { mode: "unknown", probe: "" };
        const roundReviewResult = await traced({
          inputSummary: "Main-thread round review summary with tool_choice none.",
          outputSummary: (value) => `provider=${value.providerLabel}; chars=${value.contentText.length}`,
          phase: "review",
          trace,
          toolName: "main_thread_round_review",
          run: () => callPracticeChatModelStream({
            debugContext: { goal, phase: "review", roundId, sessionId },
            messages: [
              { role: "system", content: "You are O2I Practice main thread. Follow the active user request exactly; this review call must not use tools or choose next-round questions." },
              { role: "system", content: stableStringify({
                cache_policy: { cache_prefix_version: cachePrefixVersion },
                course_framework: sessionRecord.course_framework_snapshot ?? null,
                session_plan: sessionRecord.session_plan ?? null,
              }) },
              ...threadMessages,
              { role: "user", content: roundReviewPrompt },
            ],
            onDelta: (text) => {
              if (roundReviewStream.mode === "plain") {
                send("round_review_delta", { text });
                return;
              }
              if (roundReviewStream.mode === "structured") return;

              roundReviewStream.probe += text;
              const trimmedProbe = roundReviewStream.probe.trimStart();
              if (trimmedProbe.startsWith("{") || trimmedProbe.startsWith("```")) {
                roundReviewStream.mode = "structured";
              } else if (trimmedProbe.length >= 32 || /[.!?]\s/.test(trimmedProbe)) {
                roundReviewStream.mode = "plain";
                send("round_review_delta", { text: roundReviewStream.probe });
                roundReviewStream.probe = "";
              }
            },
            profile,
            toolChoice: "none",
          }),
        });
        if (roundReviewResult.usage) {
          trace.push({
            inputSummary: "Provider usage for main-thread round review.",
            llmUsage: roundReviewResult.usage,
            outputSummary: summarizeLLMUsage(roundReviewResult.usage),
            phase: "review",
            toolName: "model_usage",
          });
        }
        const summary = normalizeRoundReviewSummary(roundReviewResult.contentText) ||
          "Round review completed, but the main thread returned an empty summary.";
        if (roundReviewStream.mode !== "plain") {
          send("round_review_delta", { text: summary });
        }

        await persistRoundReviewSummary({
          providerLabel: roundReviewResult.providerLabel,
          roundId,
          sessionId,
          summary,
          supabase,
          trace,
          userId: auth.user.id,
        });

        const response: PracticeReviewResponse = {
          llmUsage: usageEnvelopes,
          mode: "ai",
          nextRoundGoal: goal,
          providerLabel: roundReviewResult.providerLabel,
          questionReviews,
          results,
          sessionId,
          summary,
          trace,
          updatedSessionMemory: "",
        };
        send("result", response);
      } catch (error) {
        const failure = logPracticeProviderFailure({
          error,
          operation: "practice_review",
        });
        trace.push({
          error: failure.message,
          inputSummary: "Two-stage review failed; no fallback review was written.",
          phase: "review",
          toolName: "review_error",
        });
        send("error", {
          code: failure.code,
          correlationId: failure.correlationId,
          error: failure.message,
          trace,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}
