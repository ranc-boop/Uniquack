# AI Parsing Selective Execution Benchmark

## Status

This is a local planning benchmark, not a provider-cost claim.

| Run | Source pages | Planned sent pages | Estimated page reduction | Provider tokens/cost | Result |
| --- | ---: | ---: | ---: | --- | --- |
| Full-document baseline | 24 | 24 | 0% | Not collected | Not re-run; historical 403 remains unresolved |
| Selective planner fixture | 24 | 9 | 62.5% | Not collected | Passed locally |

## Fixture

The fixture is a non-sensitive, sparse 24-page PDF model with:

- two well-classified question pages;
- answer-key context;
- blank intervening pages;
- no scanned-PDF flag, unknown content, or high-confidence cross-page risk; and
- an original-to-local page map for every planned page.

The conservative planner selected 9 pages across its bounded windows. It did
not send a PDF to a provider, create a question, write a Review Draft, or
contact any provider.

## Interpretation

The 62.5% figure is an input-page planning estimate only. Actual token use,
cost, provider latency, Review Draft count, crop/visual preservation, boundary
quality, duplicate behavior, and coverage must be measured from safe operations
telemetry after a paired provider run.

## Paired Run Gate

Run only after:

1. migration `0037_ai_selective_execution_control.sql` is applied and the
   global control remains disabled;
2. one bounded full-document baseline succeeds with the same provider, model, source PDF,
   target Bank, and worker environment; and
3. a super-admin explicitly enables the controlled selective-execution flag.

Compare the two runs for question count, source references, visual/crop
preservation, boundary and duplicate warnings, coverage, sent pages, provider
calls, token usage, cost, and latency. Missing provider usage remains unknown;
it must never be replaced with fabricated values.
