const VALID_JSON_ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t"]);
const LATEX_COMMAND_ESCAPES_THAT_LOOK_LIKE_JSON = [
  "bar",
  "beta",
  "binom",
  "boldsymbol",
  "boxed",
  "frac",
  "forall",
  "leftarrow",
  "nabla",
  "neq",
  "not",
  "notin",
  "nu",
  "rightarrow",
  "right",
  "rho",
  "sqrt",
  "tan",
  "text",
  "tfrac",
  "theta",
  "times",
];

function isHexDigit(value: string) {
  return /^[0-9a-fA-F]$/.test(value);
}

function readAsciiLetters(value: string, start: number) {
  let cursor = start;

  while (/[A-Za-z]/.test(value[cursor] ?? "")) {
    cursor += 1;
  }

  return value.slice(start, cursor);
}

function isLikelyLatexCommandEscape(value: string, backslashIndex: number) {
  const command = readAsciiLetters(value, backslashIndex + 1).toLowerCase();

  return LATEX_COMMAND_ESCAPES_THAT_LOOK_LIKE_JSON.some(
    (latexCommand) => command === latexCommand || command.startsWith(latexCommand),
  );
}

function findJsonLikeRange(value: string) {
  const objectStart = value.indexOf("{");
  const arrayStart = value.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);

  if (!starts.length) {
    return null;
  }

  const start = Math.min(...starts);
  const stack: string[] = [];
  let inString = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (char === "\\") {
        index += 1;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const opener = stack.pop();

      if ((char === "}" && opener !== "{") || (char === "]" && opener !== "[")) {
        return null;
      }

      if (!stack.length) {
        return value.slice(start, index + 1);
      }
    }
  }

  const objectEnd = value.lastIndexOf("}");
  const arrayEnd = value.lastIndexOf("]");
  const end = Math.max(objectEnd, arrayEnd);

  return end > start ? value.slice(start, end + 1) : null;
}

function extractJsonCandidate(value: string) {
  const trimmed = value.trim().replace(/^\uFEFF/, "");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);

  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return trimmed;
  }

  return findJsonLikeRange(trimmed)?.trim() ?? trimmed;
}

function repairInvalidJsonEscapes(value: string) {
  let repaired = "";
  let inString = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

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

    const next = value[index + 1];

    if (next === undefined) {
      repaired += "\\\\";
      continue;
    }

    if (VALID_JSON_ESCAPES.has(next) && !isLikelyLatexCommandEscape(value, index)) {
      repaired += `\\${next}`;
      index += 1;
      continue;
    }

    if (next === "u") {
      const hex = value.slice(index + 2, index + 6);

      if (hex.length === 4 && [...hex].every(isHexDigit)) {
        repaired += "\\u";
      } else {
        repaired += "\\\\u";
      }

      index += 1;
      continue;
    }

    repaired += `\\\\${next}`;
    index += 1;
  }

  return repaired;
}

export function parsePossiblyMalformedJson(value: string) {
  const candidate = extractJsonCandidate(value);
  const repaired = repairInvalidJsonEscapes(candidate);

  if (repaired !== candidate) {
    try {
      return JSON.parse(repaired) as unknown;
    } catch {
      // Fall through to the original candidate so callers still get the
      // provider-adjacent JSON.parse error if repair could not recover it.
    }
  }

  try {
    return JSON.parse(candidate) as unknown;
  } catch (initialError) {
    throw initialError;
  }
}
