export type PracticeQuestionIdentityLike = {
  id: string;
  sourceQuestionId?: string | null;
};

export function canonicalPracticeSourceQuestionId(
  question: PracticeQuestionIdentityLike,
) {
  return question.sourceQuestionId?.trim() || question.id;
}
