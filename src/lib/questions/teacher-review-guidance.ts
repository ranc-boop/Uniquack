import type { QuestionBoundaryGuardFinding } from "@/lib/ai-pdf-import/question-boundary-guard";

export type TeacherReviewGuidanceCategory =
  | "answer_solution"
  | "duplicate"
  | "evidence"
  | "other"
  | "source_boundary"
  | "taxonomy"
  | "visual";

export type TeacherReviewGuidanceItem = {
  category: TeacherReviewGuidanceCategory;
  level: "blocking" | "review";
  sourcePages: number[];
  summary: string;
  title: string;
};

type GuidanceCopy = Pick<
  TeacherReviewGuidanceItem,
  "category" | "summary" | "title"
>;

const COPY_BY_CATEGORY: Record<TeacherReviewGuidanceCategory, GuidanceCopy> = {
  answer_solution: {
    category: "answer_solution",
    summary: "Confirm that the marked answer, options, and explanation agree.",
    title: "Answer and solution need review",
  },
  duplicate: {
    category: "duplicate",
    summary: "Compare the related Review Drafts and keep only the intended question.",
    title: "Possible duplicate draft",
  },
  evidence: {
    category: "evidence",
    summary: "Add or verify the missing question content or supporting evidence before approval.",
    title: "Evidence is incomplete",
  },
  other: {
    category: "other",
    summary: "Resolve the stored Review check before approving this draft.",
    title: "Stored Review check needs attention",
  },
  source_boundary: {
    category: "source_boundary",
    summary: "Confirm that the prompt, choices, answer, and cited pages belong to the same source question.",
    title: "Source boundary needs review",
  },
  taxonomy: {
    category: "taxonomy",
    summary: "Confirm the suggested classification, or leave it unassigned when the source is ambiguous.",
    title: "Taxonomy needs review",
  },
  visual: {
    category: "visual",
    summary: "Confirm that each required figure belongs to this question and has accessible context.",
    title: "Visual evidence needs review",
  },
};

function categoryForSignal(signal: string): TeacherReviewGuidanceCategory {
  if (/asset|image|figure|media|visual|alternative text/i.test(signal)) {
    return "visual";
  }
  if (/taxonomy|tag|classification|facet/i.test(signal)) {
    return "taxonomy";
  }
  if (/answer|choice|option|solution|explanation|rubric|graded/i.test(signal)) {
    return "answer_solution";
  }
  if (/duplicate/i.test(signal)) {
    return "duplicate";
  }
  if (/boundary|page|source|extraction|lineage|question number/i.test(signal)) {
    return "source_boundary";
  }
  if (/evidence|missing|required|unavailable|incomplete/i.test(signal)) {
    return "evidence";
  }
  return "other";
}

function categoryForBoundaryFinding(
  finding: QuestionBoundaryGuardFinding,
): TeacherReviewGuidanceCategory {
  switch (finding.issueKind) {
    case "likely_duplicate":
    case "recovery_duplicate":
      return "duplicate";
    case "answer_alignment":
    case "solution_only_fragment":
      return "answer_solution";
    case "visual_association":
      return "visual";
    case "choices_only_fragment":
    case "cross_page_fragment":
    case "packet_chunk_boundary_split":
    case "question_number_conflict":
      return "source_boundary";
    default:
      return "other";
  }
}

function normalizedSourcePages(values: number[]) {
  return Array.from(
    new Set(
      values.filter(
        (value) => Number.isInteger(value) && Number.isFinite(value) && value > 0,
      ),
    ),
  ).sort((left, right) => left - right);
}

function guidanceItem({
  category,
  level,
  sourcePages = [],
}: {
  category: TeacherReviewGuidanceCategory;
  level: TeacherReviewGuidanceItem["level"];
  sourcePages?: number[];
}): TeacherReviewGuidanceItem {
  return {
    ...COPY_BY_CATEGORY[category],
    level,
    sourcePages: normalizedSourcePages(sourcePages),
  };
}

export function buildTeacherReviewGuidance({
  boundaryFindings = [],
  hardErrors = [],
  reviewStatus,
  softWarnings = [],
}: {
  boundaryFindings?: QuestionBoundaryGuardFinding[];
  hardErrors?: string[];
  reviewStatus?: string | null;
  softWarnings?: string[];
}) {
  const items: TeacherReviewGuidanceItem[] = [];

  for (const finding of boundaryFindings) {
    items.push(
      guidanceItem({
        category: categoryForBoundaryFinding(finding),
        level: "review",
        sourcePages: Array.isArray(finding.pageRefs) ? finding.pageRefs : [],
      }),
    );
  }

  for (const error of hardErrors) {
    items.push(
      guidanceItem({
        category: categoryForSignal(error),
        level: "blocking",
      }),
    );
  }

  for (const warning of softWarnings) {
    items.push(
      guidanceItem({
        category: categoryForSignal(warning),
        level: "review",
      }),
    );
  }

  if (reviewStatus === "needs_more_evidence") {
    items.push(
      guidanceItem({
        category: "evidence",
        level: "blocking",
      }),
    );
  }

  const uniqueItems = new Map<string, TeacherReviewGuidanceItem>();
  for (const item of items) {
    const key = `${item.level}:${item.category}`;
    const existing = uniqueItems.get(key);
    uniqueItems.set(
      key,
      existing
        ? {
            ...existing,
            sourcePages: normalizedSourcePages([
              ...existing.sourcePages,
              ...item.sourcePages,
            ]),
          }
        : item,
    );
  }

  return [...uniqueItems.values()];
}
