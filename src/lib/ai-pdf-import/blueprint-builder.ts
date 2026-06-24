import type { TaxonomyCatalogView } from "@/components/tags/taxonomy-tag-tree-picker";
import {
  buildQuestionBlueprintPlan,
  type QuestionBlueprintCandidateInput,
  type QuestionBlueprintPlan,
  type QuestionBlueprintQuestionType,
  type QuestionBlueprintRequest,
} from "@/lib/taxonomy/question-blueprint";

export type AIPdfQuestionBlueprintBuilderResult = {
  questionBlueprintPlan: QuestionBlueprintPlan;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown) {
  return asArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function numberValue(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function questionType(value: unknown): QuestionBlueprintQuestionType {
  return value === "mcq" ||
    value === "fill_blank" ||
    value === "mixed" ||
    value === "frq"
    ? value
    : "frq";
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function tagsFromTaxonomyQuestionTaggingPlan(aiPdfImport: Record<string, unknown>) {
  const plan = asRecord(aiPdfImport.taxonomyQuestionTaggingPlan);
  return uniqueStrings(
    asArray(plan.suggestions)
      .map(asRecord)
      .flatMap((suggestion) =>
        Object.values(asRecord(suggestion.tags)).flatMap(stringList),
      ),
  );
}

function candidatesFromCreatedQuestions(summary: Record<string, unknown>) {
  return asArray(summary.createdQuestions)
    .map(asRecord)
    .slice(0, 100)
    .map((question, index): QuestionBlueprintCandidateInput => ({
      difficulty: numberValue(question.difficulty ?? question.difficultyRating, 500),
      hasAnswerSpec: Boolean(question.answerSpec ?? question.answer_spec),
      hasOptions: asArray(question.options).length > 0,
      id: String(question.id ?? `created-question-${index + 1}`),
      questionCode:
        typeof question.questionCode === "string"
          ? question.questionCode
          : typeof question.question_code === "string"
            ? question.question_code
            : undefined,
      questionType: questionType(question.questionType ?? question.question_type),
      status: typeof question.status === "string" ? question.status : "draft",
      tagIds: stringList(question.tagIds ?? question.tag_ids),
      title: typeof question.title === "string" ? question.title.slice(0, 160) : undefined,
    }));
}

export function buildQuestionBlueprintRequestFromAIPdfSummary({
  defaultQuestionCount = 10,
  summary,
}: {
  defaultQuestionCount?: number;
  summary: Record<string, unknown>;
}): QuestionBlueprintRequest {
  const aiPdfImport = asRecord(summary.aiPdfImport);
  const targetTagIds = tagsFromTaxonomyQuestionTaggingPlan(aiPdfImport);
  const questionCount = Math.max(
    1,
    Math.min(
      100,
      Math.trunc(
        numberValue(
          aiPdfImport.createdQuestionCount,
          numberValue(summary.createdCount, defaultQuestionCount),
        ),
      ),
    ),
  );
  const mcqCount = Math.floor(questionCount / 3);
  const fillBlankCount = Math.floor(questionCount / 3);
  const frqCount = questionCount - mcqCount - fillBlankCount;

  return {
    difficultyDistribution: [
      {
        count: Math.ceil(questionCount / 2),
        label: "core",
        max: 650,
        min: 350,
      },
      {
        count: Math.floor(questionCount / 2),
        label: "stretch",
        max: 850,
        min: 651,
      },
    ],
    questionCount,
    questionTypeDistribution: [
      { count: mcqCount, questionType: "mcq" },
      { count: fillBlankCount, questionType: "fill_blank" },
      { count: frqCount, questionType: "frq" },
    ],
    targetTagIds,
  };
}

export function buildAIPdfQuestionBlueprintPlan({
  candidates,
  catalog,
  generatedAt,
  request,
  summary,
}: {
  candidates?: QuestionBlueprintCandidateInput[];
  catalog: TaxonomyCatalogView;
  generatedAt?: string;
  request?: QuestionBlueprintRequest;
  summary: Record<string, unknown>;
}): AIPdfQuestionBlueprintBuilderResult {
  const questionBlueprintPlan = buildQuestionBlueprintPlan({
    candidates: candidates ?? candidatesFromCreatedQuestions(summary),
    catalog,
    generatedAt,
    request: request ?? buildQuestionBlueprintRequestFromAIPdfSummary({ summary }),
  });

  return { questionBlueprintPlan };
}

export function mergeQuestionBlueprintPlanIntoAIPdfSummary<T extends Record<string, unknown>>(
  aiPdfImport: T | null | undefined,
  questionBlueprintPlan: QuestionBlueprintPlan,
) {
  return {
    ...(aiPdfImport ?? {}),
    questionBlueprintPlan,
  };
}
