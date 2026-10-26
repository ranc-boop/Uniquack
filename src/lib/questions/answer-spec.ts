import type { Json } from "@/types/database";
import { AI_INPUT_LIMITS } from "@/lib/ai-input-limits";

export type QuestionOption = {
  content_html: string;
  content_source?: string;
  id: string;
  label: string;
};

export type QuestionAnswerSpec = {
  accepted_answers?: string[];
  allow_multiple?: boolean;
  case_sensitive?: boolean;
  correct_option_ids?: string[];
  equivalence?: "exact" | "numeric" | "math";
  final_answers?: string[];
  grading_mode?: "manual_or_ai";
  kind?: "mcq" | "fill_blank" | "frq" | "mixed";
  numeric_tolerance?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function splitLines(value: FormDataEntryValue | null) {
  return typeof value === "string"
    ? value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, AI_INPUT_LIMITS.ANSWER_LIST_ITEMS)
        .map((item) => item.slice(0, AI_INPUT_LIMITS.ANSWER_ENTRY_CHARS))
    : [];
}

function boundedFormText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key);
  if (typeof value !== "string") return value;
  if (value.length > maxLength) {
    throw new Error(`${key} must be ${maxLength} characters or fewer.`);
  }
  return value;
}

function normalizeOptionId(value: string, index: number) {
  const normalized = value.trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);
  return normalized || String.fromCharCode(65 + index);
}

export function normalizeQuestionOptions(value: unknown): QuestionOption[] {
  const rows = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value
          .split("\n")
          .map((line, index) => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            const [rawId, ...contentParts] = trimmed.split("|");
            const content = contentParts.length ? contentParts.join("|") : rawId;
            return {
              content_html: content.trim(),
              id: contentParts.length ? rawId.trim() : String.fromCharCode(65 + index),
              label: contentParts.length ? rawId.trim() : String.fromCharCode(65 + index),
            };
          })
          .filter(Boolean)
      : value && typeof value === "object"
        ? Object.entries(value as Record<string, unknown>).map(([id, content]) => ({
            content_html: String(content ?? ""),
            id,
            label: id,
          }))
        : [];
  const seen = new Set<string>();

  return rows
    .map((item, index): QuestionOption | null => {
      const record = asRecord(item);
      const id = normalizeOptionId(
        String(record.id ?? record.label ?? String.fromCharCode(65 + index)),
        index,
      );
      const label = String(record.label ?? id).trim().slice(0, 24) || id;
      const content =
        String(record.content_html ?? record.content_source ?? record.content ?? "")
          .trim()
          .slice(0, 2000);

      if (!content || seen.has(id)) {
        return null;
      }

      seen.add(id);
      return {
        content_html: content,
        content_source:
          typeof record.content_source === "string" && record.content_source.trim()
            ? record.content_source.trim().slice(0, 2000)
            : content,
        id,
        label,
      };
    })
    .filter((item): item is QuestionOption => Boolean(item));
}

function parseOptionsText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return [];
  }

  return normalizeQuestionOptions(
    value
      .split("\n")
      .map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const [rawId, ...contentParts] = trimmed.split("|");
        const content = contentParts.length ? contentParts.join("|") : rawId;
        return {
          content_html: content.trim(),
          id: contentParts.length ? rawId.trim() : String.fromCharCode(65 + index),
          label: contentParts.length ? rawId.trim() : String.fromCharCode(65 + index),
        };
      })
      .filter(Boolean),
  );
}

export function answerSpecFromFormData(formData: FormData) {
  const questionType = String(formData.get("question_type") ?? "frq");
  const options = parseOptionsText(
    boundedFormText(formData, "options_text", AI_INPUT_LIMITS.OPTION_TEXT_CHARS),
  ).slice(0, AI_INPUT_LIMITS.OPTION_ITEMS);
  const correctOptionIds = splitLines(
    boundedFormText(formData, "correct_option_ids", AI_INPUT_LIMITS.ANSWER_TEXT_CHARS),
  );
  const finalAnswers = splitLines(
    boundedFormText(formData, "final_answers", AI_INPUT_LIMITS.ANSWER_TEXT_CHARS),
  );
  const acceptedAnswers = splitLines(
    boundedFormText(formData, "accepted_answers", AI_INPUT_LIMITS.ANSWER_TEXT_CHARS),
  );
  const tolerance = Number(formData.get("numeric_tolerance") ?? "");
  const equivalence = String(formData.get("equivalence") ?? "math");

  if (questionType === "mcq") {
    if (!options.length) {
      throw new Error("MCQ questions require options.");
    }

    const filteredCorrectOptionIds = correctOptionIds.filter((id) =>
      options.some((option) => option.id === id),
    );

    if (!filteredCorrectOptionIds.length) {
      throw new Error("MCQ questions require at least one correct option ID.");
    }

    return {
      answerSpec: {
        allow_multiple: String(formData.get("allow_multiple") ?? "") === "on",
        correct_option_ids: filteredCorrectOptionIds,
        kind: "mcq",
      } satisfies QuestionAnswerSpec,
      options,
    };
  }

  if (questionType === "fill_blank") {
    if (!finalAnswers.length && !acceptedAnswers.length) {
      throw new Error("Fill blank questions require final answers or accepted answers.");
    }

    return {
      answerSpec: {
        accepted_answers: acceptedAnswers,
        case_sensitive: String(formData.get("case_sensitive") ?? "") === "on",
        equivalence:
          equivalence === "exact" || equivalence === "numeric" ? equivalence : "math",
        final_answers: finalAnswers,
        kind: "fill_blank",
        numeric_tolerance: Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 0,
      } satisfies QuestionAnswerSpec,
      options: [],
    };
  }

  return {
    answerSpec: {
      grading_mode: "manual_or_ai",
      kind: questionType === "mixed" ? "mixed" : "frq",
    } satisfies QuestionAnswerSpec,
    options: [],
  };
}

export function normalizeAnswerSpec(value: unknown): QuestionAnswerSpec {
  const record = asRecord(value);
  const kind = String(record.kind ?? "").trim();

  if (kind === "mcq") {
    return {
      allow_multiple: Boolean(record.allow_multiple),
      correct_option_ids: Array.isArray(record.correct_option_ids)
        ? record.correct_option_ids.map(String).filter(Boolean)
        : [],
      kind: "mcq",
    };
  }

  if (kind === "fill_blank") {
    const numericTolerance = Number(record.numeric_tolerance ?? 0);
    return {
      accepted_answers: Array.isArray(record.accepted_answers)
        ? record.accepted_answers.map(String).filter(Boolean)
        : [],
      case_sensitive: Boolean(record.case_sensitive),
      equivalence:
        record.equivalence === "exact" || record.equivalence === "numeric"
          ? record.equivalence
          : "math",
      final_answers: Array.isArray(record.final_answers)
        ? record.final_answers.map(String).filter(Boolean)
        : [],
      kind: "fill_blank",
      numeric_tolerance:
        Number.isFinite(numericTolerance) && numericTolerance >= 0
          ? numericTolerance
          : 0,
    };
  }

  return {
    grading_mode: "manual_or_ai",
    kind: kind === "mixed" ? "mixed" : "frq",
  };
}

export function answerSpecToJson(value: QuestionAnswerSpec): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

export function optionsToJson(value: QuestionOption[]): Json[] {
  return JSON.parse(JSON.stringify(value)) as Json[];
}
