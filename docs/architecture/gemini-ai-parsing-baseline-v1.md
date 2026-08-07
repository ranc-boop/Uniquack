# Gemini AI Parsing Baseline V1

## Status

`AI_PARSING_PROVIDER_BENCHMARK_V1` is frozen and reproducible, but its Gemini
observation set is `NOT_RUN`. The current classification is:

`GEMINI_AI_PARSING_BASELINE_V1_BLOCKED_BY_PROVIDER_OBSERVATIONS`

No paid Provider call was authorized or made while adding this accounting
contract. Historical PDF50 traffic remains operational evidence and is not
relabeled as the model-quality benchmark.

## Safe usage accounting

The Provider-neutral schema in
`src/lib/ai-operations/provider-usage.ts` keeps five sources distinct:

- `PROVIDER_REPORTED_USAGE`: numeric metadata returned with a completed model
  response;
- `PROVIDER_COUNT_TOKENS`: preflight input counts from a Provider tokenizer;
- `LOCAL_CONTEXT_BYTES`: source and serialized-request bytes, never tokens;
- `ESTIMATED_USAGE`: explicitly labeled estimates only;
- `UNKNOWN_USAGE`: fields for which no trustworthy measurement exists.

Gemini `generateContent` now safely captures `promptTokenCount`,
`cachedContentTokenCount`, `candidatesTokenCount`,
`toolUsePromptTokenCount`, `thoughtsTokenCount`, `totalTokenCount`, and bounded
numeric `promptTokensDetails` when returned. Missing fields remain `null`; they
are never converted to zero. Aggregate usage also remains unknown if any
included attempt lacks that measurement.

Accounting persisted in checkpoints contains numeric aggregates and safe
modality labels only. It contains no prompts, source text, filenames, raw
Provider responses, API keys, private identifiers, or user content. Existing
version-5 checkpoints without `usageAccounting` remain readable.

## Gemini token preflight

Gemini continues to use raw REST `v1beta`; no SDK migration is needed. The
optional `countTokens` request wraps the same `GenerateContentRequest` used by
`generateContent`, adding only the model resource name required by the token
endpoint. It is off by default, so ordinary worker behavior and network budgets
do not change. Bounded experiments may choose `best_effort` or `required` and
the request is charged to the existing fail-closed Provider HTTP budget.

If a request is sent but no response is received, a successful preflight input
count is retained while output, thinking, and total response usage remain
`UNKNOWN_USAGE`.

## Fixed benchmark

The manifest is
`fixtures/ai-parsing-provider-benchmark-v1/manifest.json`. Its six deterministic
repository-authored PDFs cover all required categories:

| Source | Coverage | SHA-256 |
| --- | --- | --- |
| `text-free-response` | text, free response | `74a55b8a16b5335f91241e4fe6f10d57a4f003dbde1db0ab2ece3477ad027f5d` |
| `answer-key` | multi-page answer key | `1c9d38a50043fa63aad4b2dba10b265567d98f360352683f2edf3b88b4d6e771` |
| `equation` | equations | `c87044561a49a3151718dacd8a4299f6d354113648994fb6c096f65650da3faa` |
| `visual-evidence` | table, visual, missing visual, multi-part | `09bc5eb8b70e6f5c4cfa122a33fd048cd60448ffeaffc49180cc59b6afa95938` |
| `taxonomy-ambiguous` | taxonomy abstention | `279067c78dab9f7ba48e223d493e58f4aa1ba6224638ed8d434fbcb43abeca17` |
| `insufficient-evidence` | insufficient evidence | `dce2d1709b337e02edb8e3c0e75a9f68b1394f366ad1f6cd6fe9bc8d2e49591c` |

The manifest also binds canonical-LF hashes for the Golden manifest, parsing,
taxonomy, and visual cases. Production tuning against benchmark literals is
prohibited. Each future observation must bind Provider/model, attempt reason,
benchmark version, parsing-contract hash, authoritative taxonomy snapshot hash,
and the runtime candidate-subset hash.

Current runtime bindings are:

- parsing contract:
  `5c19aed2d13c85121d89b09a3a85064f2eea200016560780295f2d7510e9ca95`;
- taxonomy snapshot:
  `05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe`;
- candidate subset: recorded separately for every attempt at run time.

## Required report

When a complete observation set exists, the deterministic reporter calculates:

- input, candidate-output, thinking, and total tokens per attempt;
- total tokens per completed job and per valid Review Draft;
- attempts and usage-derived cost per valid Review Draft;
- p50/p95 request input tokens, total tokens, and latency;
- measurement coverage and exact source labels for every value.

No current value is fabricated. In particular, the historical Stage 10
aggregate of 101,547 input tokens, 3,015 output tokens, 104,562 total tokens,
and 11,361 estimated micros lacks the fixed six-source observation rows and
cannot supply benchmark p50/p95 or per-attempt results.

## Evidence boundary

`OPERATIONAL_PDF50_EVIDENCE` proves admission, queueing, worker execution,
private pending Review Draft persistence, lineage, cleanup, and scale behavior.

`MODEL_QUALITY_PROVIDER_BENCHMARK` measures a model on the immutable six-source
corpus. The two evidence classes answer different questions and must not be
combined.

## Remaining gate

One separately authorized, bounded Gemini run must process the six fixed
sources with complete safe observation rows and exact runtime bindings. After
that evidence is frozen, the same manifest and evaluator can be used for a
future GPT-5.6 Luna arm. PR #229 does not call or configure Luna.

Source-only validation:

```text
node scripts/ai-provider-usage-accounting-smoke.mjs
node scripts/ai-parsing-eval/provider-benchmark-v1-smoke.mjs
node scripts/ai-parsing-eval/gemini-baseline-v1.mjs
```

The final command currently and intentionally returns
`GEMINI_BASELINE_PROVIDER_OBSERVATIONS_NOT_RUN` with `PROVIDER_CALLS=0`.
