import { redirect } from "next/navigation";

import { FormSubmitButton } from "@/components/form-submit-button";
import { requireAdmin } from "@/lib/auth/guards";
import { inferAiProviderMode } from "@/lib/ai-providers/adapters";
import {
  listEnabledAIProviderProfiles,
  loadAIProviderProfileForUse,
} from "@/lib/ai-providers/profiles";
import { createClient } from "@/lib/supabase/server";
import { loadTaxonomyCatalog } from "@/lib/tags/taxonomy-db";
import { taxonomyDisplayLabelFromId } from "@/lib/tags/taxonomy-display";
import {
  buildQuestionBlueprintPlan,
  QUESTION_BLUEPRINT_FACETS,
  QUESTION_BLUEPRINT_QUESTION_TYPES,
  type QuestionBlueprintCandidateInput,
  type QuestionBlueprintFacet,
  type QuestionBlueprintPlan,
  type QuestionBlueprintQuestionType,
  type QuestionBlueprintRequest,
} from "@/lib/taxonomy/question-blueprint";
import {
  buildBlueprintGenerationRequestPlan,
  type BlueprintGenerationRequestPlan,
} from "@/lib/taxonomy/question-blueprint-generation";
import {
  buildBlueprintProviderRunPlan,
  type BlueprintProviderRunPlan,
} from "@/lib/taxonomy/question-blueprint-provider-runner";
import { executeBlueprintGenerationRequestWithDeepSeek } from "@/lib/taxonomy/question-blueprint-execution";
import { TaxonomyTagTreePicker } from "@/components/tags/taxonomy-tag-tree-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Database, Json } from "@/types/database";

type AdminBlueprintsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type QuestionRow = Pick<
  Database["public"]["Tables"]["questions"]["Row"],
  | "answer_spec"
  | "difficulty_rating"
  | "id"
  | "options"
  | "question_code"
  | "question_type"
  | "status"
  | "title"
>;

type QuestionTaxonomyAssignmentRow = Pick<
  Database["public"]["Tables"]["question_taxonomy_assignments"]["Row"],
  "question_id" | "review_status" | "tag_id"
>;

const difficultyBuckets = [
  { countName: "difficulty_core_count", label: "core", max: 650, min: 350 },
  { countName: "difficulty_stretch_count", label: "stretch", max: 850, min: 651 },
] as const;

const typeBuckets: Array<{
  label: string;
  name: string;
  questionType: QuestionBlueprintQuestionType;
}> = [
  { label: "MCQ", name: "type_mcq_count", questionType: "mcq" },
  { label: "Fill blank", name: "type_fill_blank_count", questionType: "fill_blank" },
  { label: "FRQ", name: "type_frq_count", questionType: "frq" },
  { label: "Mixed", name: "type_mixed_count", questionType: "mixed" },
];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function checkboxParam(value: string | string[] | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  const values = Array.isArray(value) ? value : [value];
  return values.includes("true");
}

function tagIdList(value: string | string[] | undefined) {
  const values = Array.isArray(value) ? value : [value ?? ""];
  return values
    .flatMap((item) => item.split(/[,\s]+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function numericParam(
  value: string | string[] | undefined,
  fallback: number,
  { max = 1000, min = 0 }: { max?: number; min?: number } = {},
) {
  const numeric = Number(firstParam(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function blueprintHrefWithResult({
  params,
  result,
}: {
  params: Record<string, string | string[] | undefined>;
  result: Record<string, string | number>;
}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("blueprint_result_")) continue;
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, item);
    }
  }

  for (const [key, value] of Object.entries(result)) {
    query.set(`blueprint_result_${key}`, String(value));
  }

  const serialized = query.toString();
  return serialized ? `/admin/blueprints?${serialized}` : "/admin/blueprints";
}

function blueprintExecutionResultFromParams(
  params: Record<string, string | string[] | undefined>,
) {
  const status = firstParam(params.blueprint_result_status);
  if (!status) return null;

  return {
    draftCount: firstParam(params.blueprint_result_draft_count) ?? "0",
    error: firstParam(params.blueprint_result_error) ?? "",
    model: firstParam(params.blueprint_result_model) ?? "-",
    provider: firstParam(params.blueprint_result_provider) ?? "-",
    requestId: firstParam(params.blueprint_result_request_id) ?? "-",
    status,
    warningCount: firstParam(params.blueprint_result_warning_count) ?? "0",
  };
}

function defaultTargetTagsByFacet({
  catalog,
}: {
  catalog: Awaited<ReturnType<typeof loadTaxonomyCatalog>>["catalog"];
}) {
  const parentTagIds = new Set(
    catalog.nodes.flatMap((node) => node.parent_tag_ids ?? []),
  );

  return Object.fromEntries(
    QUESTION_BLUEPRINT_FACETS.map((facet) => [
      facet,
      catalog.nodes
        .filter(
          (node) =>
            node.facet_key === facet &&
            node.is_assignable !== false &&
            !parentTagIds.has(node.tag_id),
        )
        .slice(0, facet === "concept" ? 2 : 1)
        .map((node) => node.tag_id),
    ]),
  ) as Partial<Record<QuestionBlueprintFacet, string[]>>;
}

function selectedTagsByFacet({
  defaults,
  params,
}: {
  defaults: Partial<Record<QuestionBlueprintFacet, string[]>>;
  params: Record<string, string | string[] | undefined>;
}) {
  return Object.fromEntries(
    QUESTION_BLUEPRINT_FACETS.map((facet) => {
      const selected = tagIdList(params[`target_${facet}`]);
      return [facet, selected.length ? selected : (defaults[facet] ?? [])];
    }),
  ) as Partial<Record<QuestionBlueprintFacet, string[]>>;
}

function buildRequest({
  params,
  targetTagsByFacet,
}: {
  params: Record<string, string | string[] | undefined>;
  targetTagsByFacet: Partial<Record<QuestionBlueprintFacet, string[]>>;
}): QuestionBlueprintRequest {
  const questionCount = numericParam(params.question_count, 12, {
    max: 100,
    min: 1,
  });
  const coreCount = numericParam(
    params.difficulty_core_count,
    Math.ceil(questionCount / 2),
    { max: questionCount },
  );
  const stretchCount = numericParam(
    params.difficulty_stretch_count,
    Math.max(0, questionCount - coreCount),
    { max: questionCount },
  );
  const mcqCount = numericParam(params.type_mcq_count, Math.floor(questionCount / 3), {
    max: questionCount,
  });
  const fillBlankCount = numericParam(
    params.type_fill_blank_count,
    Math.floor(questionCount / 3),
    { max: questionCount },
  );
  const frqCount = numericParam(
    params.type_frq_count,
    Math.max(0, questionCount - mcqCount - fillBlankCount),
    { max: questionCount },
  );
  const mixedCount = numericParam(params.type_mixed_count, 0, {
    max: questionCount,
  });

  return {
    difficultyDistribution: [
      { count: coreCount, label: "core", max: 650, min: 350 },
      { count: stretchCount, label: "stretch", max: 850, min: 651 },
    ],
    questionCount,
    questionTypeDistribution: [
      { count: mcqCount, questionType: "mcq" },
      { count: fillBlankCount, questionType: "fill_blank" },
      { count: frqCount, questionType: "frq" },
      { count: mixedCount, questionType: "mixed" },
    ],
    targetTagsByFacet,
  };
}

function isNonEmptyJson(value: Json | Json[] | null | undefined) {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== "object") return false;
  return Object.keys(value).length > 0;
}

function questionType(value: string): QuestionBlueprintQuestionType {
  return QUESTION_BLUEPRINT_QUESTION_TYPES.includes(
    value as QuestionBlueprintQuestionType,
  )
    ? (value as QuestionBlueprintQuestionType)
    : "frq";
}

function candidatesFromRows({
  assignments,
  questions,
}: {
  assignments: QuestionTaxonomyAssignmentRow[];
  questions: QuestionRow[];
}): QuestionBlueprintCandidateInput[] {
  const tagIdsByQuestionId = new Map<string, string[]>();

  for (const assignment of assignments) {
    tagIdsByQuestionId.set(assignment.question_id, [
      ...(tagIdsByQuestionId.get(assignment.question_id) ?? []),
      assignment.tag_id,
    ]);
  }

  return questions.map((question) => ({
    difficulty: question.difficulty_rating,
    hasAnswerSpec: isNonEmptyJson(question.answer_spec),
    hasOptions: Array.isArray(question.options) && question.options.length > 0,
    id: question.id,
    questionCode: question.question_code,
    questionType: questionType(question.question_type),
    status: question.status,
    tagIds: tagIdsByQuestionId.get(question.id) ?? [],
    title: question.title,
  }));
}

async function loadCandidateInputs({
  reviewedOnly,
  supabase,
}: {
  reviewedOnly: boolean;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(
      "id,question_code,title,difficulty_rating,question_type,options,answer_spec,status",
    )
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (questionsError) {
    return {
      candidates: [] as QuestionBlueprintCandidateInput[],
      message: `Candidate questions are unavailable: ${questionsError.message}`,
    };
  }

  const questionRows = (questions ?? []) as QuestionRow[];
  const questionIds = questionRows.map((question) => question.id);
  if (!questionIds.length) {
    return {
      candidates: [] as QuestionBlueprintCandidateInput[],
      message: "No published question candidates are available yet.",
    };
  }

  let assignmentQuery = supabase
    .from("question_taxonomy_assignments")
    .select("question_id,tag_id,review_status")
    .in("question_id", questionIds);

  if (reviewedOnly) {
    assignmentQuery = assignmentQuery.eq("review_status", "approved");
  }

  const { data: assignments, error: assignmentsError } = await assignmentQuery;
  if (assignmentsError) {
    return {
      candidates: [] as QuestionBlueprintCandidateInput[],
      message: `Candidate taxonomy assignments are unavailable: ${assignmentsError.message}`,
    };
  }

  return {
    candidates: candidatesFromRows({
      assignments: (assignments ?? []) as QuestionTaxonomyAssignmentRow[],
      questions: questionRows,
    }),
    message: null,
  };
}

function SelectedTagList({ tagIds }: { tagIds: string[] }) {
  if (!tagIds.length) {
    return <span className="text-muted-foreground">No target tags selected</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tagIds.map((tagId) => (
        <Badge key={tagId} variant="outline">
          {taxonomyDisplayLabelFromId(tagId)}
          <span className="ml-1 font-mono text-[10px] opacity-70">{tagId}</span>
        </Badge>
      ))}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function coverageGapReasonText(value: string) {
  return value;
}

function BlueprintSummary({ plan }: { plan: QuestionBlueprintPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Blueprint summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SummaryMetric label="Questions" value={plan.summary.questionCount} />
          <SummaryMetric label="Targets" value={plan.summary.targetTagCount} />
          <SummaryMetric label="Sections" value={plan.summary.sectionCount} />
          <SummaryMetric label="Candidates" value={plan.summary.candidateCount} />
          <SummaryMetric label="Coverage gaps" value={plan.summary.coverageGapCount} />
          <SummaryMetric
            label="Generation drafts"
            value={plan.summary.generationRequestCount}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={plan.validation.valid ? "secondary" : "destructive"}>
            {plan.validation.valid ? "Valid preview" : "Needs adjustment"}
          </Badge>
          <Badge variant="outline">Mode: {plan.mode}</Badge>
          <Badge variant="outline">No provider call</Badge>
          <Badge variant="outline">No DB write</Badge>
        </div>
        {plan.validation.errors.length ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">Validation issues</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {plan.validation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {plan.warnings.length ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Planning warnings</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {plan.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FacetCoverage({ plan }: { plan: QuestionBlueprintPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Facet coverage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {plan.sections.length ? (
          plan.sections.map((section) => (
            <div className="rounded-md border p-3" key={section.sectionId}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <Badge variant="outline">{section.requirementCount} targets</Badge>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {section.requirements.map((requirement) => (
                  <div
                    className="rounded-md bg-muted/30 p-2 text-sm"
                    key={requirement.tagId}
                  >
                    <p className="font-medium">{requirement.label}</p>
                    <p className="break-all font-mono text-[11px] text-muted-foreground">
                      {requirement.tagId}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Desired {requirement.desiredCount}; existing{" "}
                      {requirement.existingCandidateCount}; missing{" "}
                      {requirement.missingCount}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Select active assignable taxonomy leaf tags to build facet coverage.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CandidateSets({ plan }: { plan: QuestionBlueprintPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidate question sets</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">Search plan</p>
          <p className="mt-1 text-xs text-muted-foreground">
            RPC: {plan.candidateSet.searchPlan.rpc}; status:{" "}
            {plan.candidateSet.searchPlan.questionStatus}; review:{" "}
            {plan.candidateSet.searchPlan.assignmentReviewStatus}; difficulty{" "}
            {plan.candidateSet.searchPlan.difficultyMin}-
            {plan.candidateSet.searchPlan.difficultyMax}
          </p>
          <div className="mt-2">
            <SelectedTagList tagIds={plan.candidateSet.searchPlan.includeTagIds} />
          </div>
        </div>
        {plan.candidateSet.candidates.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {plan.candidateSet.candidates.slice(0, 12).map((candidate) => (
              <div className="rounded-md border p-3 text-sm" key={candidate.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {candidate.questionCode ?? candidate.id}
                  </span>
                  <Badge variant="outline">{candidate.questionType}</Badge>
                  <Badge variant="outline">{candidate.difficulty}</Badge>
                </div>
                {candidate.title ? (
                  <p className="mt-1 text-muted-foreground">{candidate.title}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  Matched {candidate.matchedTagIds.length} target tags; answer spec{" "}
                  {candidate.hasAnswerSpec ? "present" : "missing"}; options{" "}
                  {candidate.hasOptions ? "present" : "missing"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No existing published candidates match the current taxonomy target plan.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CoverageGaps({ plan }: { plan: QuestionBlueprintPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Missing coverage gaps</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {plan.coverageGaps.length ? (
          plan.coverageGaps.map((gap) => (
            <div className="rounded-md border p-3 text-sm" key={gap.tagId}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {taxonomyDisplayLabelFromId(gap.tagId)}
                </span>
                <Badge variant="outline">{gap.facet}</Badge>
                <Badge variant="secondary">missing {gap.missingCount}</Badge>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {gap.tagId}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {coverageGapReasonText(gap.reason)}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No coverage gaps are planned for this preview.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function GenerationDrafts({
  generationPlan,
}: {
  generationPlan: BlueprintGenerationRequestPlan;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Generation request drafts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Draft only - no AI call yet</Badge>
            <Badge variant="outline">{generationPlan.summary.draftCount} drafts</Badge>
            <Badge variant="outline">
              {generationPlan.summary.totalRequestedQuestions} planned questions
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            These request drafts translate target coverage gaps into future
            generation prompts and model routing metadata. They do not execute,
            create questions, or write Review Drafts.
          </p>
        </div>
        {generationPlan.requests.length ? (
          generationPlan.requests.map((request) => (
            <div className="rounded-md border p-3 text-sm" key={request.requestId}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{request.requestId}</span>
                <Badge variant="outline">{request.status}</Badge>
                <Badge variant="outline">{request.questionType}</Badge>
                <Badge variant="outline">{request.modelRoute.providerFamily}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Draft count {request.count}; difficulty{" "}
                {request.difficultyRange.min}-{request.difficultyRange.max}; types{" "}
                {request.questionType}; purpose: {request.promptPlan.targetCoverage}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Selected model route: {request.modelRoute.modelHint}
              </p>
              <div className="mt-2">
                <SelectedTagList
                  tagIds={request.targetTags.map((targetTag) => targetTag.tagId)}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No future generation drafts are needed for this preview.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ProviderResultPreview({
  result,
}: {
  result: ReturnType<typeof blueprintExecutionResultFromParams>;
}) {
  if (!result) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider result preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={result.status === "succeeded" ? "secondary" : "destructive"}>
            {result.status}
          </Badge>
          <Badge variant="outline">Request {result.requestId}</Badge>
          <Badge variant="outline">{result.provider}</Badge>
          <Badge variant="outline">{result.model}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Generated draft count: {result.draftCount}; validation warnings:{" "}
          {result.warningCount}.{" "}
          {"Generated questions are draft-only and require review."}
        </p>
        {result.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {result.error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProviderRunDrafts({
  executeAction,
  runPlan,
}: {
  executeAction: (formData: FormData) => Promise<void>;
  runPlan: BlueprintProviderRunPlan;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Provider run shadow plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Shadow only - no AI call yet</Badge>
            <Badge variant="outline">{runPlan.summary.runCount} run drafts</Badge>
            <Badge variant="outline">{runPlan.summary.readyRunCount} ready</Badge>
            <Badge variant="outline">{runPlan.summary.blockedRunCount} blocked</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Provider payloads are previews for routing review only. They do not
            execute, call a model, persist generated questions, or write Review
            Drafts.
          </p>
        </div>
        {runPlan.runs.length ? (
          runPlan.runs.map((run) => (
            <div className="rounded-md border p-3 text-sm" key={run.runId}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{run.runId}</span>
                <Badge variant={run.status === "ready" ? "secondary" : "outline"}>
                  {run.status}
                </Badge>
                <Badge variant="outline">{run.providerKind}</Badge>
                <Badge variant="outline">{run.modelName}</Badge>
                <Badge variant="outline">realCall: {String(run.realCall)}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Request {run.requestId}; question type{" "}
                {run.promptPayloadPreview.questionType}; count{" "}
                {run.promptPayloadPreview.count}; difficulty{" "}
                {run.promptPayloadPreview.difficultyRange.min}-
                {run.promptPayloadPreview.difficultyRange.max}
              </p>
              <div className="mt-3 rounded-md bg-muted/30 p-3">
                <p className="text-xs font-medium">Prompt preview summary</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {run.promptPayloadPreview.user}
                </p>
              </div>
              <div className="mt-3 rounded-md bg-muted/30 p-3">
                <p className="text-xs font-medium">Expected output schema</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {run.expectedOutputSchema.root}:{" "}
                  {run.expectedOutputSchema.fields.join(", ")}
                </p>
              </div>
              {run.warnings.length ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {run.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
              {run.providerKind === "deepseek" && run.status === "ready" ? (
                <form action={executeAction} className="mt-3">
                  <input name="request_id" type="hidden" value={run.requestId} />
                  <FormSubmitButton pendingLabel="Running DeepSeek..." size="sm">
                    Run DeepSeek draft generation
                  </FormSubmitButton>
                </form>
              ) : (
                <Button className="mt-3" disabled size="sm" type="button" variant="outline">
                  Run DeepSeek draft generation
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No provider run drafts are needed for this preview.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ModelRoutingPlan({ plan }: { plan: QuestionBlueprintPlan }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Model routing plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {plan.modelRoutingPlan.routes.map((route) => (
          <div
            className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-[220px_1fr]"
            key={route.task}
          >
            <div>
              <Badge variant="outline">{route.providerFamily}</Badge>
              <p className="mt-1 font-medium">{route.task.replaceAll("_", " ")}</p>
            </div>
            <p className="text-muted-foreground">{route.modelHint}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default async function AdminBlueprintsPage({
  searchParams,
}: AdminBlueprintsPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const { catalog, errorMessage: taxonomyCatalogError } =
    await loadTaxonomyCatalog(supabase);
  const reviewedOnly = checkboxParam(params.reviewed_only, true);
  const defaults = defaultTargetTagsByFacet({ catalog });
  const targetTagsByFacet = selectedTagsByFacet({ defaults, params });
  const request = buildRequest({ params, targetTagsByFacet });
  const { candidates, message: candidateMessage } = await loadCandidateInputs({
    reviewedOnly,
    supabase,
  });
  const plan = buildQuestionBlueprintPlan({
    candidates,
    catalog,
    generatedAt: "preview",
    request,
  });
  const generationPlan = buildBlueprintGenerationRequestPlan({
    catalog,
    generatedAt: "preview",
    plan,
  });
  const providerRunPlan = buildBlueprintProviderRunPlan({
    generatedAt: "preview",
    generationPlan,
  });
  const executionResult = blueprintExecutionResultFromParams(params);

  async function runDeepSeekBlueprintGeneration(formData: FormData) {
    "use server";

    await requireAdmin();
    const requestId = String(formData.get("request_id") ?? "");
    const selectedRequest = generationPlan.requests.find(
      (requestItem) => requestItem.requestId === requestId,
    );
    const selectedRun = providerRunPlan.runs.find(
      (runItem) => runItem.requestId === requestId,
    );

    if (!selectedRequest || !selectedRun || selectedRun.status !== "ready") {
      redirect(
        blueprintHrefWithResult({
          params,
          result: {
            error: "Selected DeepSeek blueprint request is not ready.",
            request_id: requestId || "-",
            status: "failed",
          },
        }),
      );
    }

    const actionSupabase = await createClient();
    const safeProfiles = await listEnabledAIProviderProfiles(actionSupabase);
    const deepSeekProfile = safeProfiles.find(
      (profile) => inferAiProviderMode(profile) === "deepseek_openai",
    );

    if (!deepSeekProfile) {
      redirect(
        blueprintHrefWithResult({
          params,
          result: {
            error: "No enabled DeepSeek provider profile is configured.",
            request_id: requestId,
            status: "failed",
          },
        }),
      );
    }

    let result: Awaited<
      ReturnType<typeof executeBlueprintGenerationRequestWithDeepSeek>
    >;
    try {
      const profile = await loadAIProviderProfileForUse({
        profileId: deepSeekProfile.id,
        supabase: actionSupabase,
      });
      result = await executeBlueprintGenerationRequestWithDeepSeek({
        catalog,
        profile,
        request: selectedRequest,
        run: selectedRun,
      });
    } catch (error) {
      redirect(
        blueprintHrefWithResult({
          params,
          result: {
            error:
              error instanceof Error
                ? error.message.slice(0, 300)
                : "Unknown DeepSeek execution error.",
            request_id: requestId,
            status: "failed",
          },
        }),
      );
    }

    redirect(
      blueprintHrefWithResult({
        params,
        result: {
          draft_count: result.generatedDraftCount,
          model: result.modelName,
          provider: result.providerName,
          request_id: result.requestId,
          status: result.status,
          warning_count: result.warnings.length,
        },
      }),
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <div className="space-y-2">
        <Badge variant="outline">Admin preview</Badge>
        <h1 className="text-3xl font-semibold">Question blueprint preview</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Build a planning-only blueprint from active taxonomy leaf tags,
          published candidate questions, coverage gaps, generation drafts, and a
          model routing plan. This page does not call providers or write records.
        </p>
      </div>

      {taxonomyCatalogError ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {taxonomyCatalogError}
        </div>
      ) : null}
      {candidateMessage ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          {candidateMessage}
        </div>
      ) : null}

      <form className="space-y-4 rounded-md border p-4" method="get">
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <TaxonomyTagTreePicker
            defaultOpenFacetKeys={["curriculum", "concept"]}
            namePrefix="target"
            selectable="assignable"
            selectedTagIds={targetTagsByFacet}
            taxonomyCatalog={catalog}
            title="Target taxonomy tags"
          />
          <div className="space-y-4">
            <div className="rounded-md border p-3">
              <Label htmlFor="question_count">Total question count</Label>
              <Input
                className="mt-2"
                defaultValue={String(request.questionCount)}
                id="question_count"
                max={100}
                min={1}
                name="question_count"
                type="number"
              />
            </div>

            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">Difficulty distribution</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {difficultyBuckets.map((bucket, index) => (
                  <label className="space-y-1" key={bucket.countName}>
                    <span className="text-xs font-medium text-muted-foreground">
                      {bucket.label} ({bucket.min}-{bucket.max})
                    </span>
                    <Input
                      defaultValue={String(
                        request.difficultyDistribution[index]?.count ?? 0,
                      )}
                      min={0}
                      name={bucket.countName}
                      type="number"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">Question type distribution</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {typeBuckets.map((bucket) => (
                  <label className="space-y-1" key={bucket.name}>
                    <span className="text-xs font-medium text-muted-foreground">
                      {bucket.label}
                    </span>
                    <Input
                      defaultValue={String(
                        request.questionTypeDistribution.find(
                          (item) => item.questionType === bucket.questionType,
                        )?.count ?? 0,
                      )}
                      min={0}
                      name={bucket.name}
                      type="number"
                    />
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input name="reviewed_only" type="hidden" value="false" />
              <input
                className="mt-1"
                defaultChecked={reviewedOnly}
                name="reviewed_only"
                type="checkbox"
                value="true"
              />
              <span>
                <span className="block font-medium">Reviewed-only candidates</span>
                <span className="text-xs text-muted-foreground">
                  Candidate plan uses approved taxonomy assignments only.
                </span>
              </span>
            </label>

            <Button type="submit">Preview blueprint</Button>
          </div>
        </div>
      </form>

      <BlueprintSummary plan={plan} />
      <ProviderResultPreview result={executionResult} />

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <FacetCoverage plan={plan} />
          <CandidateSets plan={plan} />
        </div>
        <div className="space-y-6">
          <CoverageGaps plan={plan} />
          <GenerationDrafts generationPlan={generationPlan} />
        </div>
      </div>

      <ProviderRunDrafts
        executeAction={runDeepSeekBlueprintGeneration}
        runPlan={providerRunPlan}
      />
      <ModelRoutingPlan plan={plan} />
    </main>
  );
}
