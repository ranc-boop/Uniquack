const jsonEscapeChars = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"]);
const latexCommandsThatLookLikeJsonEscapes = new Set([
  "backslash",
  "bar",
  "begin",
  "beta",
  "big",
  "bigcap",
  "bigcup",
  "bigg",
  "binom",
  "bot",
  "boxed",
  "bullet",
  "frac",
  "forall",
  "footnotesize",
  "frown",
  "neq",
  "ne",
  "neg",
  "not",
  "notin",
  "nabla",
  "natural",
  "rightarrow",
  "right",
  "rangle",
  "rbrace",
  "rceil",
  "rfloor",
  "rho",
  "sqrt",
  "tan",
  "tanh",
  "tau",
  "text",
  "theta",
  "times",
  "to",
  "top",
  "triangle",
]);

function isAsciiLetter(value: string | undefined) {
  return Boolean(value && /[A-Za-z]/.test(value));
}

function readAsciiCommand(value: string, start: number) {
  let cursor = start;

  while (cursor < value.length && isAsciiLetter(value[cursor])) {
    cursor += 1;
  }

  return value.slice(start, cursor);
}

function shouldPreserveSingleCharJsonEscape(value: string, index: number) {
  const next = value[index + 1];

  if (!next || !jsonEscapeChars.has(next)) {
    return false;
  }

  if (next === "u") {
    return /^[0-9a-fA-F]{4}$/.test(value.slice(index + 2, index + 6));
  }

  if (!isAsciiLetter(next)) {
    return true;
  }

  const command = readAsciiCommand(value, index + 1);

  return !latexCommandsThatLookLikeJsonEscapes.has(command);
}

/**
 * Repair common LaTeX-in-JSON authoring mistakes before JSON.parse sees them.
 *
 * The standard parser treats sequences such as \\theta correctly only when the
 * JSON text contains two backslashes. Hand-authored imports frequently contain
 * single-backslash LaTeX commands: \theta, \frac, \begin, \[, \(. Some are
 * invalid JSON escapes, while others such as \theta parse as a tab plus text and
 * silently corrupt the formula. This scanner only modifies backslashes inside
 * JSON strings, preserving normal JSON escapes and already-escaped backslashes.
 */
export function repairLatexBackslashesInJsonStrings(jsonText: string) {
  let repaired = "";
  let inString = false;

  for (let index = 0; index < jsonText.length; index += 1) {
    const char = jsonText[index];

    if (!inString) {
      repaired += char;
      if (char === '"') {
        inString = true;
      }
      continue;
    }

    if (char === '"') {
      repaired += char;
      inString = false;
      continue;
    }

    if (char !== "\\") {
      repaired += char;
      continue;
    }

    const next = jsonText[index + 1];

    if (!next) {
      repaired += "\\\\";
      continue;
    }

    if (next === "\\") {
      repaired += "\\\\";
      index += 1;
      continue;
    }

    if (shouldPreserveSingleCharJsonEscape(jsonText, index)) {
      repaired += `\\${next}`;

      if (next === "u") {
        repaired += jsonText.slice(index + 2, index + 6);
        index += 5;
      } else {
        index += 1;
      }
      continue;
    }

    if (isAsciiLetter(next)) {
      const command = readAsciiCommand(jsonText, index + 1);
      repaired += `\\\\${command}`;
      index += command.length;
      continue;
    }

    if ("[](){}|,;:! ".includes(next)) {
      repaired += `\\\\${next}`;
      index += 1;
      continue;
    }

    repaired += `\\\\${next}`;
    index += 1;
  }

  return repaired;
}

export function parseImportJsonWithLatexRepair(jsonText: string) {
  const repaired = repairLatexBackslashesInJsonStrings(jsonText);

  try {
    return JSON.parse(repaired) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Invalid import JSON after LaTeX backslash repair: ${message}`,
    );
  }
}

export function parseImportQuestionsJsonWithLatexRepair(jsonText: string) {
  const parsed = parseImportJsonWithLatexRepair(jsonText);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "questions" in parsed &&
    Array.isArray(parsed.questions)
  ) {
    return parsed.questions;
  }

  throw new Error("JSON must be an array or an object with a questions array.");
}
