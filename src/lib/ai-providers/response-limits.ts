export class AIProviderResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`AI provider response exceeded the ${maxBytes}-byte safety limit.`);
    this.name = "AIProviderResponseTooLargeError";
  }
}

export function assertResponseContentLength(response: Response, maxBytes: number) {
  const rawLength = response.headers.get("content-length");
  if (!rawLength) return;
  const length = Number(rawLength);
  if (Number.isFinite(length) && length > maxBytes) {
    void response.body?.cancel().catch(() => undefined);
    throw new AIProviderResponseTooLargeError(maxBytes);
  }
}

export async function readResponseTextWithLimit(response: Response, maxBytes: number) {
  assertResponseContentLength(response, maxBytes);
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AIProviderResponseTooLargeError(maxBytes);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

export async function readResponseJsonWithLimit<T>(response: Response, maxBytes: number) {
  const text = await readResponseTextWithLimit(response, maxBytes);
  return JSON.parse(text) as T;
}
