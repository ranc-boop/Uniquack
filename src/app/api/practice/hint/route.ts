import { NextResponse } from "next/server";

import { requirePracticeApiUser } from "@/lib/practice/auth";
import { callPracticeJsonModel, loadPracticeAIProfile } from "@/lib/practice/ai";
import { compactText, traced } from "@/lib/practice/context";
import type {
  PracticeHintRequest,
  PracticeHintResponse,
  PracticeTraceEvent,
} from "@/lib/practice/types";
import { loadQuestionForHint } from "@/lib/practice/tools";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AIHintResponse = {
  hint?: string;
};

function fallbackHint(level: number) {
  if (level <= 1) {
    return "Start by identifying what the question is asking for, then write the key formula or relationship before calculating.";
  }

  if (level === 2) {
    return "Try substituting the known information into the relevant relationship and simplify one step at a time.";
  }

  return "Check whether your answer matches the required form and whether any restrictions or units are being ignored.";
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

  const body = (await request.json()) as PracticeHintRequest;
  const questionId = (body.questionId ?? "").trim();
  const hintLevel = Math.min(4, Math.max(1, Math.trunc(Number(body.hintLevel ?? 1))));
  const trace: PracticeTraceEvent[] = [];

  if (!questionId) {
    return NextResponse.json({ error: "questionId is required." }, { status: 400 });
  }


  try {
    const question = await traced({
      inputSummary: questionId,
      outputSummary: (value) => `${value.questionCode}/${value.questionType}/${value.difficulty}`,
      phase: "hint",
      trace,
      toolName: "get_hint_safe_question_context",
      run: () => loadQuestionForHint({ questionId, supabase }),
    });

    trace.push({
      inputSummary: "Hint call uses only current question, current answer, hint level, and previous hint summaries. It does not share the main round context.",
      outputSummary: `question excerpt=${question.contentExcerpt.length} chars; previous hints=${body.previousHints?.length ?? 0}`,
      phase: "context",
      toolName: "compact_hint_context",
    });

    try {
      const profile = await loadPracticeAIProfile(supabase);
      const aiResult = await traced({
        inputSummary: `DS hint call for ${question.questionCode}, level ${hintLevel}.`,
        outputSummary: (value) => `provider=${value.providerLabel}`,
        phase: "hint",
        trace,
        toolName: "ds_generate_hint",
        run: () =>
          callPracticeJsonModel<AIHintResponse>({
            debugContext: { phase: "hint", questionId },
            profile,
            messages: [
              {
                role: "system",
                content: [
                  "You are O2I Hint Agent. Give one short hint for the current question only.",
                  "This is a separate call and has no access to the main recommendation/review context.",
                  "Do not reveal the final answer, correct option, or full solution. Do not mention hidden answer data.",
                  "Return JSON only: {\"hint\":\"...\"}.",
                ].join("\n"),
              },
              {
                role: "user",
                content: JSON.stringify({
                  current_answer: body.currentAnswer ?? "",
                  hint_level: hintLevel,
                  previous_hints: (body.previousHints ?? []).slice(-3),
                  question: {
                    content: compactText(question.contentHtml, 1000),
                    difficulty: question.difficulty,
                    options: question.options.map((option) => ({
                      content: compactText(option.content_html, 220),
                      id: option.id,
                      label: option.label,
                    })),
                    question_code: question.questionCode,
                    question_type: question.questionType,
                    title: question.title,
                  },
                }),
              },
            ],
          }),
      });
      const response: PracticeHintResponse = {
        hint: aiResult.parsed.hint?.trim() || fallbackHint(hintLevel),
        mode: "ai",
        providerLabel: aiResult.providerLabel,
        trace,
      };

      return NextResponse.json(response);
    } catch (error) {
      trace.push({
        error: error instanceof Error ? error.message : String(error),
        inputSummary: "AI hint failed; fallback hint used.",
        phase: "hint",
        toolName: "ds_generate_hint",
      });
      const response: PracticeHintResponse = {
        hint: fallbackHint(hintLevel),
        mode: "heuristic",
        trace,
      };

      return NextResponse.json(response);
    }
  } catch (error) {
    trace.push({
      error: error instanceof Error ? error.message : String(error),
      inputSummary: "Question lookup failed; generic fallback hint used.",
      phase: "hint",
      toolName: "get_hint_safe_question_context",
    });

    return NextResponse.json({
      hint: fallbackHint(hintLevel),
      mode: "heuristic",
      trace,
    } satisfies PracticeHintResponse);
  }
}
