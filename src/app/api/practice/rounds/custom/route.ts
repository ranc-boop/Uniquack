import { NextResponse } from "next/server";

import { htmlToPlainTextExcerpt } from "@/lib/html/excerpt";
import { requirePracticeApiUser } from "@/lib/practice/auth";
import { canonicalPracticeSourceQuestionId } from "@/lib/practice/question-identity";
import {
  CURRENT_PRACTICE_SESSION_SCHEMA_VERSION,
  createPracticeSession,
  normalizePracticeTagContext,
  persistRecommendationRound,
} from "@/lib/practice/persistence";
import {
  isCurrentPracticeQuestionSnapshot,
  PRACTICE_SESSION_EXPIRED_MESSAGE,
} from "@/lib/practice/schema";
import {
  PRACTICE_INPUT_LIMITS,
  boundedPracticeText,
  practiceValidationResponse,
} from "@/lib/practice/request-validation";
import type {
  PracticeRecommendation,
  PracticeRecommendResponse,
  PracticeTraceEvent,
} from "@/lib/practice/types";
import { normalizeQuestionOptions } from "@/lib/questions/answer-spec";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const MAX_CUSTOM_QUESTIONS = 12;

type CustomRoundRequest = {
  goal?: string;
  questionIds?: string[];
  sessionId?: string;
};

function uniqueIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(String).map((item) => item.trim()).filter(Boolean)))
    : [];
}

function recommendationFromQuestion(
  row: {
    content_html: string;
    difficulty_rating: number;
    id: string;
    options: unknown;
    question_code: string;
    question_type: PracticeRecommendation["questionType"];
    source: string | null;
    title: string;
  },
  tagIds: string[],
): PracticeRecommendation {
  return {
    contentExcerpt: htmlToPlainTextExcerpt(row.content_html),
    contentHtml: row.content_html,
    difficulty: Number(row.difficulty_rating ?? 0),
    expectedSkill: "Self-selected practice",
    id: row.id,
    options: normalizeQuestionOptions(row.options),
    questionCode: row.question_code,
    questionType: row.question_type,
    reason: "Selected from the question bank or a saved missed-question record.",
    source: row.source,
    sourceQuestionId: row.id,
    tagIds,
    title: row.title,
  };
}

function recommendationFromWrongSnapshot(row: Record<string, unknown>): PracticeRecommendation | null {
  if (!isCurrentPracticeQuestionSnapshot(row.question_snapshot)) {
    return null;
  }

  const snapshot = row.question_snapshot as Partial<PracticeRecommendation>;
  const sourceQuestionId = String(row.source_question_id ?? snapshot.id ?? "").trim();

  if (!sourceQuestionId) {
    return null;
  }

  return {
    contentExcerpt: String(snapshot.contentExcerpt ?? htmlToPlainTextExcerpt(String(snapshot.contentHtml ?? ""))),
    contentHtml: String(snapshot.contentHtml ?? ""),
    difficulty: Number(snapshot.difficulty ?? 0),
    expectedSkill: String(snapshot.expectedSkill ?? "Re-practice from saved mistake"),
    id: sourceQuestionId,
    options: Array.isArray(snapshot.options) ? snapshot.options : [],
    questionCode: String(row.question_code ?? snapshot.questionCode ?? "snapshot"),
    questionType: (snapshot.questionType ?? "mixed") as PracticeRecommendation["questionType"],
    reason: "Recovered from your saved missed-question snapshot because the source question may no longer be published.",
    source: typeof snapshot.source === "string" ? snapshot.source : null,
    sourceQuestionId,
    tagIds: Array.isArray(snapshot.tagIds) ? snapshot.tagIds.map(String) : [],
    title: String(row.question_title ?? snapshot.title ?? "Saved missed question"),
  };
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

  const body = (await request.json()) as CustomRoundRequest;
  const questionIds = uniqueIds(body.questionIds);
  let goal = "Question practice";
  try {
    goal = boundedPracticeText(body.goal ?? goal, {
      field: "goal",
      maxLength: PRACTICE_INPUT_LIMITS.GOAL_CHARS,
      required: true,
    });
  } catch (error) {
    const validation = practiceValidationResponse(error);
    return NextResponse.json(
      validation?.body ?? { code: "INVALID_CUSTOM_ROUND", error: "Invalid custom round request." },
      { status: validation?.status ?? 400 },
    );
  }
  let sessionId = (body.sessionId ?? "").trim();

  if (!questionIds.length) {
    return NextResponse.json({ error: "At least one questionId is required." }, { status: 400 });
  }
  if (questionIds.length > MAX_CUSTOM_QUESTIONS) {
    return NextResponse.json(
      { code: "TOO_MANY_QUESTIONS", error: `Choose at most ${MAX_CUSTOM_QUESTIONS} questions.` },
      { status: 413 },
    );
  }

  if (!sessionId) {
    const session = await createPracticeSession({
      goal,
      supabase,
      title: "Question practice",
      userId: auth.user.id,
    });
    sessionId = session.id;
  }

  const { data: session, error: sessionError } = await supabase
    .from("practice_sessions")
    .select("cache_prefix_version,id,session_memory,tag_context")
    .eq("user_id", auth.user.id)
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    return NextResponse.json(
      { code: "CUSTOM_ROUND_SESSION_FAILED", error: "Unable to load this practice session." },
      { status: 500 },
    );
  }

  if (!session) {
    return NextResponse.json({ error: "Practice session not found." }, { status: 404 });
  }
  if (session.cache_prefix_version !== CURRENT_PRACTICE_SESSION_SCHEMA_VERSION) {
    return NextResponse.json({ error: PRACTICE_SESSION_EXPIRED_MESSAGE }, { status: 410 });
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, question_code, title, content_html, difficulty_rating, options, question_type, source")
    .in("id", questionIds)
    .eq("status", "published");

  if (questionsError) {
    return NextResponse.json(
      { code: "CUSTOM_ROUND_QUESTIONS_FAILED", error: "Unable to load the selected questions." },
      { status: 500 },
    );
  }

  const liveQuestionIds = new Set((questions ?? []).map((question) => question.id));
  const { data: assignments, error: assignmentsError } = liveQuestionIds.size
    ? await supabase
        .from("question_taxonomy_assignments")
        .select("question_id, tag_id")
        .in("question_id", Array.from(liveQuestionIds))
        .eq("review_status", "approved")
    : { data: [], error: null };

  if (assignmentsError) {
    return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
  }

  const tagIdsByQuestion = new Map<string, string[]>();
  for (const assignment of assignments ?? []) {
    tagIdsByQuestion.set(assignment.question_id, [
      ...(tagIdsByQuestion.get(assignment.question_id) ?? []),
      assignment.tag_id,
    ]);
  }

  const liveRecommendations = new Map(
    (questions ?? []).map((question) => [
      question.id,
      recommendationFromQuestion(question, tagIdsByQuestion.get(question.id) ?? []),
    ]),
  );
  const missingQuestionIds = questionIds.filter((questionId) => !liveRecommendations.has(questionId));
  const snapshotRecommendations = new Map<string, PracticeRecommendation>();

  if (missingQuestionIds.length) {
    const { data: wrongRows, error: wrongError } = await supabase
      .from("practice_wrong_questions")
      .select("source_question_id,question_code,question_title,question_snapshot")
      .eq("user_id", auth.user.id)
      .in("source_question_id", missingQuestionIds);

    if (wrongError) {
      return NextResponse.json({ error: wrongError.message }, { status: 500 });
    }

    for (const row of wrongRows ?? []) {
      const recommendation = recommendationFromWrongSnapshot(row as Record<string, unknown>);
      if (recommendation) {
        snapshotRecommendations.set(recommendation.id, recommendation);
      }
    }
  }

  const recommendations = questionIds
    .map((questionId) => liveRecommendations.get(questionId) ?? snapshotRecommendations.get(questionId))
    .filter((question): question is PracticeRecommendation => Boolean(question));

  if (!recommendations.length) {
    return NextResponse.json(
      { error: "No published questions or saved mistake snapshots were available for this custom round." },
      { status: 404 },
    );
  }

  const trace: PracticeTraceEvent[] = [
    {
      inputSummary: `custom questionIds=${questionIds.length}; live=${liveRecommendations.size}; snapshot=${snapshotRecommendations.size}`,
      outputSummary: `created ${recommendations.length} custom recommendations`,
      phase: "context",
      resultCount: recommendations.length,
      toolName: "custom_practice_round",
    },
  ];
  const tagContext = normalizePracticeTagContext(session.tag_context, goal);
  const response: PracticeRecommendResponse = {
    maxToolCalls: 0,
    mode: "heuristic",
    recommendations,
    roundGoal: goal,
    sessionId,
    sessionMemory: String(session.session_memory ?? ""),
    tagContext,
    trace,
  };

  response.roundId = await persistRecommendationRound({
    recommendations,
    response: {
      ...response,
      currentTaskSuffix: {
        current_round_request: {
          goal,
          question_count: recommendations.length,
          source: "custom_question_selection",
        },
        selected_question_ids: recommendations.map(canonicalPracticeSourceQuestionId),
        tag_context: tagContext,
        volatile_notice: "Custom practice round selected directly by the user.",
      },
    },
    sessionId,
    supabase,
    trace,
    userId: auth.user.id,
  });

  return NextResponse.json(response);
}
