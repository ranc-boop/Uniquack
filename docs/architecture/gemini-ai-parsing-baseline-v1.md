# Gemini AI Parsing Baseline V1

## Status

`AI_PARSING_PROVIDER_BENCHMARK_V1` is complete and frozen. The final
classification is:

`GEMINI_AI_PARSING_BASELINE_V1_READY_FOR_LUNA_COMPARISON`

The trustworthy result was produced at source head
`53527d4068d348ffb04093632910da545eca0601`. It is stored as safe numeric and
categorical evidence in
`fixtures/ai-parsing-provider-benchmark-v1/gemini-observations.json` and is
recomputed by `scripts/ai-parsing-eval/gemini-baseline-v1.mjs`.

This is model-quality evidence. The earlier fifty-file qualification remains
separate `OPERATIONAL_PDF50_EVIDENCE` and is not used as the primary quality
corpus.

## Frozen contracts

| Contract | Frozen value |
| --- | --- |
| Provider/model | `gemini_native` / `gemini-2.5-flash-lite` |
| Transport | Gemini raw REST `v1beta generateContent` |
| Structured output | `responseMimeType=application/json` plus `responseJsonSchema` |
| Prompt contract | `ai-pdf-extraction-prompt-v4` |
| Provider schema | `gemini-ai-pdf-extraction-schema-v3` |
| Repair policy | `source-free-structural-single-source-semantic-v2` |
| Visual contract | `AI_PDF_VISUAL_EVIDENCE_CONTRACT_VERSION=2` |
| Parsing contract SHA-256 | `5c19aed2d13c85121d89b09a3a85064f2eea200016560780295f2d7510e9ca95` |
| Taxonomy snapshot SHA-256 | `05c3179f0ce67f4828a66ddfdb7bd4c59752aceb390055cb26ba5192ddcafebe` |
| Candidate subset SHA-256 | `fd11666a6ea207244dd5c60529aef812f73c8e82120f02b5348bb4db02970262` |
| Benchmark manifest SHA-256 | `6d4fc29a959209f4e9576b76e536fd382131cff8ae11fc8a639f5f8653189712` |
| Evaluation contract SHA-256 | `51ab57b9c372078b5a86af501788949f72d6acaedb076e104873a3199f01036c` |
| Source-exact evaluator | `AI_PARSING_PROVIDER_BENCHMARK_V1_EVALUATOR_V2` |
| Evaluator implementation SHA-256 | `fb48df5c800ec0a93d0215608a989dde9437d9f1b2d0a9e651c96c496ca79306` |
| Golden corpus/evaluator | manifest v3; evaluator SHA-256 `b7e8636dde2f03c21d02c9dc0a6525c7e462494cc8918cd4227256b5f267e183` |
| Provider-visible treatment anchor | `eeff3466d7286fbe2a77b4f6fbeb060be4d77fa9` |
| Frozen observation/evidence anchor | `73c667f557ac57605c9717ab8bb7d7a6712d0b78` |

The six source-exact PDF fingerprints are:

| Source | SHA-256 |
| --- | --- |
| `text-free-response` | `74a55b8a16b5335f91241e4fe6f10d57a4f003dbde1db0ab2ece3477ad027f5d` |
| `answer-key` | `7d296821f4500d1ed58a511ee16a69b469a09c70718c10877e38667acea17ab8` |
| `equation` | `c87044561a49a3151718dacd8a4299f6d354113648994fb6c096f65650da3faa` |
| `visual-evidence` | `09bc5eb8b70e6f5c4cfa122a33fd048cd60448ffeaffc49180cc59b6afa95938` |
| `taxonomy-ambiguous` | `279067c78dab9f7ba48e223d493e58f4aa1ba6224638ed8d434fbcb43abeca17` |
| `insufficient-evidence` | `dce2d1709b337e02edb8e3c0e75a9f68b1394f366ad1f6cd6fe9bc8d2e49591c` |

## Run ledger

Two of the three authorized whole-run slots were used.

Run 1 at `46519c810076b1102d6d198a794ff9ef38d60a17` was invalidated by a
usage-accounting defect after the six source results existed only in memory.
Gemini omitted the optional cached-token field; the reporter incorrectly made
cost unresolvable even though required input, output, total and `countTokens`
coverage had passed. No model-quality result from that run was persisted. Its
entire temporary theoretical envelope of 334,248 micros is reserved against
the authorization; it is not labeled actual spend.

Run 2 completed all six sources. It made six inference requests and six
`countTokens` requests. Every source succeeded on its first attempt. No repair,
source-backed recovery, transient retry, or third run occurred.

## Per-source result

| Source | Expected / extracted | Valid / needs evidence | Boundary F1 | Answer / consistency | Input / output / total | Latency ms | Cost micros |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `answer-key` | 2 / 2 | 2 / 0 | 1.000 | 1.000 / 0.000 | 12,173 / 677 / 12,850 | 3,772 | 1,488 |
| `equation` | 2 / 2 | 2 / 0 | 1.000 | 1.000 / 1.000 | 11,399 / 328 / 11,727 | 3,961 | 1,271 |
| `insufficient-evidence` | 0 / 1 | 0 / 0 | 0.000 | N/A | 11,399 / 198 / 11,597 | 3,041 | 1,219 |
| `taxonomy-ambiguous` | 1 / 1 | 1 / 0 | 1.000 | 1.000 / 1.000 | 11,399 / 307 / 11,706 | 2,709 | 1,263 |
| `text-free-response` | 1 / 1 | 1 / 0 | 1.000 | 1.000 / 1.000 | 11,399 / 207 / 11,606 | 2,903 | 1,223 |
| `visual-evidence` | 5 / 4 | 2 / 2 | 0.889 | 0.800 / 0.400 | 12,173 / 1,810 / 13,983 | 6,222 | 1,941 |

Poor output is retained as baseline evidence. In particular, the
`insufficient-evidence` source produced one candidate instead of rejecting the
source, the taxonomy case returned no exact tag IDs, and the visual case missed
one question and made one wrong-question visual association. These results did
not trigger a rerun.

## Aggregate quality

Parsing:

- expected/extracted questions: 11 / 11;
- question-boundary precision/recall/F1: 0.909091 / 0.909091 / 0.909091;
- schema and application validity: 0.833333 / 0.833333;
- Review Drafts: 10 total, 8 valid, 2 `needs_more_evidence`;
- valid Review Draft yield: 0.727273;
- duplicates and fabricated page references: 0 / 0;
- source grounding accuracy: 0.909091;
- page-reference precision/recall/F1: 0.909091 / 0.769231 / 0.833334;
- insufficient-evidence detection: 0 / 1.

Answers:

- source-answer-key extraction accuracy: 1.000000;
- answer correctness: 0.909091;
- answer/solution consistency: 0.545455;
- answer provenance: 0.727273;
- unsupported-answer rate: 0;
- model-derived-answer correctness: N/A because the fixed corpus expected no
  model-derived answer.

Taxonomy:

- candidate retrieval: 3 / 3, recall 1.000000;
- exact-ID precision/recall/F1: 1.000000 / 0.000000 / 0.000000 under the
  evaluator's empty-prediction precision convention;
- abstention accuracy: 1.000000;
- unknown IDs, wrong-facet assignments, and broad-parent overuse: 0 / 0 / 0.

Visuals:

- visual-dependent detection precision/recall/F1: 1.000000 / 0.500000 /
  0.666667;
- required-asset association: 1 / 3, rate 0.333333;
- decorative suppression and missing-required-visual handling: 1 / 1 and
  1 / 1;
- visual-description correctness: 1 / 1;
- shared visual groups: 0 / 1;
- wrong-question associations proposed: 1, rate 0.500000.

All hard-boundary escape counters are zero: no auto-approval/publication,
fabricated page acceptance, invalid taxonomy acceptance, missing-visual
unblocking, or wrong-question visual attachment escaped validation.

## Reliability and usage

- first-attempt success: 6 / 6, rate 1.000000;
- attempts per source p50/p95: 1 / 1;
- attempts and inference requests per valid Draft: 0.75 / 0.75;
- repairs, semantic recoveries, and transient retries: 0;
- Provider HTTP requests: 30 total, including 6 token counts, 6 inference
  requests, 12 upload requests, and 6 cleanup requests;
- Provider-reported input/output/total coverage: 6/6, 6/6, 6/6;
- `countTokens` comparison coverage: 6/6 with absolute delta 0;
- total input/output/total tokens: 69,942 / 3,527 / 73,469;
- input/output/total tokens per valid Draft: 8,742.75 / 440.875 / 9,183.625;
- input tokens p50/p95: 11,399 / 12,173;
- output tokens p50/p95: 307 / 1,810;
- total tokens p50/p95: 11,706 / 13,983;
- latency p50/p95: 3,041 ms / 6,222 ms.

Gemini reported thinking tokens for one of six attempts: the known value is 2.
The other five remain `UNKNOWN_USAGE`, so aggregate thinking tokens and tokens
per Draft remain unknown. Gemini omitted cached-input counts for all six
attempts. Cached usage remains unknown; each cost estimate therefore prices all
input at the higher uncached rate.

Run-2 usage-derived cost is 8,405 micros (USD 0.008405), or 1,050.625 micros
per valid Draft. Adding run 1's full theoretical reservation gives a cumulative
credible upper bound of 342,653 micros (USD 0.342653), below the USD 0.50 cap.
Dashboard-observed spend remains `UNKNOWN_USAGE`.

## Cleanup and safety

All six Provider files requested cleanup and cleanup failures were zero. The
benchmark created zero database fixtures, database writes, Storage objects,
approvals, publications, or Assignments. Local temporary residue was zero and
process-only environment values were cleared. No source text, prompts,
filenames, raw Provider responses, credentials, or private identifiers are
stored in the evidence.

## Luna handoff

The baseline is ready for a separately authorized GPT-5.6 Luna comparison.
Luna must consume this exact manifest, evaluation contract, source bytes,
runtime taxonomy snapshot, candidate subset contract, and evaluator. It must
not overwrite or tune against this Gemini result. PR #229 does not call or
configure Luna.
