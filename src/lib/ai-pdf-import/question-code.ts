export function questionCodeKey(value: string) {
  return value.trim().toLowerCase();
}

function defaultQuestionCode(batchId: string, index: number) {
  return `AI-${batchId.slice(0, 8).toUpperCase()}-${String(index + 1).padStart(3, "0")}`;
}

function uniqueGeneratedQuestionCode({
  batchId,
  existingQuestionCodes,
  index,
  usedQuestionCodes,
}: {
  batchId: string;
  existingQuestionCodes: Set<string>;
  index: number;
  usedQuestionCodes: Set<string>;
}) {
  const baseCode = defaultQuestionCode(batchId, index);
  let questionCode = baseCode;
  let suffix = 1;

  while (
    existingQuestionCodes.has(questionCodeKey(questionCode)) ||
    usedQuestionCodes.has(questionCodeKey(questionCode))
  ) {
    suffix += 1;
    questionCode = `${baseCode}-${suffix}`;
  }

  return questionCode;
}

function warnOnce(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

export function resolveAIPdfQuestionCodeForImport({
  batchId,
  existingQuestionCodes,
  index,
  requestedQuestionCode,
  usedQuestionCodes,
  warnings,
}: {
  batchId: string;
  existingQuestionCodes: Set<string>;
  index: number;
  requestedQuestionCode: string;
  usedQuestionCodes: Set<string>;
  warnings: string[];
}) {
  let questionCode = requestedQuestionCode.trim();

  if (
    !questionCode ||
    existingQuestionCodes.has(questionCodeKey(questionCode)) ||
    usedQuestionCodes.has(questionCodeKey(questionCode))
  ) {
    const generatedQuestionCode = uniqueGeneratedQuestionCode({
      batchId,
      existingQuestionCodes,
      index,
      usedQuestionCodes,
    });
    warnOnce(
      warnings,
      questionCode
        ? `Question ${index + 1}: duplicate question_code "${questionCode}" was replaced with ${generatedQuestionCode}.`
        : `Question ${index + 1}: missing or invalid question_code was replaced with ${generatedQuestionCode}.`,
    );
    questionCode = generatedQuestionCode;
  }

  usedQuestionCodes.add(questionCodeKey(questionCode));

  return questionCode;
}
