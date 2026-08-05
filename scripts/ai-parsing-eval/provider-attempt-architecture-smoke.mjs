import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function parse(relativePath) {
  const sourceText = await readFile(resolve(root, relativePath), "utf8");
  return ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function walk(node, visit) {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

function calledName(call) {
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text;
  return null;
}

function callsNamed(sourceFile, name) {
  const matches = [];
  walk(sourceFile, (node) => {
    if (ts.isCallExpression(node) && calledName(node) === name) matches.push(node);
  });
  return matches;
}

function enclosingFunctionName(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isFunctionExpression(current) ||
        ts.isArrowFunction(current) ||
        ts.isMethodDeclaration(current)) &&
      current.name &&
      ts.isIdentifier(current.name)
    ) {
      return current.name.text;
    }

    if (
      (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) &&
      current.parent &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }
  }
  return null;
}

function objectArgument(call) {
  const first = call.arguments[0];
  assert(first && ts.isObjectLiteralExpression(first), "expected an object argument");
  return first;
}

function propertyNames(object) {
  return new Set(
    object.properties.flatMap((property) => {
      if (
        (ts.isPropertyAssignment(property) ||
          ts.isShorthandPropertyAssignment(property) ||
          ts.isMethodDeclaration(property)) &&
        property.name
      ) {
        return [property.name.getText().replace(/^['"]|['"]$/g, "")];
      }
      return [];
    }),
  );
}

function assertProperties(call, required, label) {
  const names = propertyNames(objectArgument(call));
  for (const name of required) {
    assert(names.has(name), `${label} must bind ${name}`);
  }
}

function hasAncestorCall(node, name) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isCallExpression(current) && calledName(current) === name) return true;
  }
  return false;
}

function functionBody(sourceFile, name) {
  let match = null;
  walk(sourceFile, (node) => {
    if (
      !match &&
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name &&
      node.body
    ) {
      match = node.body;
    }
  });
  assert(match, `missing function ${name}`);
  return match;
}

const [service, chat, observatory] = await Promise.all([
  parse("src/lib/ai-pdf-import/service.ts"),
  parse("src/lib/ai-providers/chat.ts"),
  parse("src/lib/ai-pdf-import/quality-observatory.ts"),
]);

const extractionCalls = callsNamed(service, "callAIPdfExtractionProvider");
assert.equal(extractionCalls.length, 3, "single, chunk, and recovery extraction paths must be explicit");
for (const [index, call] of extractionCalls.entries()) {
  assert.equal(
    hasAncestorCall(call, "runWithAIProviderRetry"),
    false,
    `extraction call ${index + 1} must not sit inside an outer Provider retry`,
  );
  assertProperties(
    call,
    [
      "attemptLedger",
      "attemptScope",
      "onAttemptLedgerCheckpoint",
      "promptContext",
      "providerRetryMaxAttempts",
      "qualityObserver",
    ],
    `extraction call ${index + 1}`,
  );
}

const retryOwners = callsNamed(chat, "runWithAIProviderRetry");
assert.equal(retryOwners.length, 1, "chat transport must have exactly one Provider retry owner");
assert.equal(
  enclosingFunctionName(retryOwners[0]),
  "runAIPdfProviderTransport",
  "the Provider-neutral transport coordinator must own retry",
);

const transportCalls = callsNamed(chat, "runAIPdfProviderTransport");
assert.equal(transportCalls.length, 2, "Gemini-native and OpenAI-compatible paths must share the coordinator");
for (const [index, call] of transportCalls.entries()) {
  assertProperties(
    call,
    [
      "attemptLedger",
      "attemptScope",
      "onAttemptLedgerCheckpoint",
      "providerRetryMaxAttempts",
      "qualityObserver",
      "sourceIncluded",
    ],
    `transport call ${index + 1}`,
  );
}

const taxonomyLoader = functionBody(service, "loadActiveTags").getText(service);
for (const requiredCall of [
  "loadTaxonomyCatalog",
  "buildRuntimeTaxonomySnapshot",
  "serializeRuntimeTaxonomyCandidates",
  "fingerprintAIPdfParsingContract",
]) {
  assert(
    taxonomyLoader.includes(`${requiredCall}(`),
    `runtime taxonomy loader must call ${requiredCall}`,
  );
}
assert(taxonomyLoader.includes("snapshot.canonicalJson"));
assert(taxonomyLoader.includes("snapshot.candidates"));

const promptBuilder = functionBody(service, "buildPrompt").getText(service);
assert(promptBuilder.includes("runtimeTaxonomy.candidatePayload"));
assert(promptBuilder.includes("runtimeTaxonomy.snapshot.sha256"));
assert(promptBuilder.includes("runtimeTaxonomy.parsingContractSha256"));

const serviceText = service.getFullText();
assert(serviceText.includes(".recordContractEvidence({"));
assert(serviceText.includes("taxonomySnapshotSha256"));
assert(serviceText.includes("parsingContractSha256"));
assert(!serviceText.includes("taxonomyCatalogByteLength"));

const chatText = chat.getFullText();
assert(chatText.includes("serializedRequestBytes"));
assert(chatText.includes("previousResponseBytes"));
assert(!chatText.includes("buildRepairPrompt"));

const observatoryText = observatory.getFullText();
assert(observatoryText.includes("repeatedSourceBytes"));
assert(observatoryText.includes("repeatedPreviousResponseBytes"));
assert(observatoryText.includes("providerReportedInputTokens"));
assert(observatoryText.includes("providerReportedOutputTokens"));

console.log(
  "PASS AI Parsing Provider attempt architecture: one retry owner, durable shared ledger, runtime taxonomy fingerprint, and serialized context evidence",
);
