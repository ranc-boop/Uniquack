import assert from "node:assert/strict";

const { sanitizeContentHtml, toDangerousHtml } = await import(
  "../src/lib/sanitize/html.ts"
);

const scriptInput = '<p>Safe</p><script>alert("x")</script>';
assert.equal(sanitizeContentHtml(scriptInput), "<p>Safe</p>");

const eventInput = '<p onclick="alert(1)">Click</p><img src=x onerror=alert(1)>';
assert.equal(sanitizeContentHtml(eventInput), "<p>Click</p>");

const javascriptUrlInput = '<a href="javascript:alert(1)">bad</a><p>ok</p>';
assert.equal(sanitizeContentHtml(javascriptUrlInput), "bad<p>ok</p>");

const storageImageInput =
  '<img src="https://example.supabase.co/storage/v1/object/public/question-assets/questions/question-id/asset-id.png" alt="diagram">';
assert.equal(
  sanitizeContentHtml(storageImageInput),
  '<img src="https://example.supabase.co/storage/v1/object/public/question-assets/questions/question-id/asset-id.png" alt="diagram" />',
);

const dangerousHtml = toDangerousHtml(scriptInput);
assert.deepEqual(dangerousHtml, { __html: "<p>Safe</p>" });

console.log(
  "PASS sanitizer removes unsafe HTML and preserves Supabase Storage image URLs",
);
