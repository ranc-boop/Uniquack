# PR4-M Selective Packet Execution and Token-Savings Validation

## Goal

Convert the existing AI PDF Packet Plan into a conservative server-side
selective-execution decision. Eligible native-PDF imports send an in-memory
subset of original pages to the configured provider; all uncertain cases keep
the existing full-document path.

## Product And Safety Boundary

Workflow touched:

```text
Private source PDF -> AI Parsing -> private Review Drafts -> Question Bank
```

This change does not publish questions, create Assignments, expose a Bank to a
student, change teacher provider selection, or enable production scheduling.
The teacher UI only receives the neutral progress state "Preparing selected
source pages". Provider/model selection and all cost controls remain server or
admin-only.

## Baseline Execution Audit

Before this change, `processAIPdfImport` generated `preanalysis`, `packetPlan`,
and `extractionBatchPlan`, but native PDF strategies still sent the original
full PDF to the provider in `processAIPdfSinglePass`.

- `gemini_native_pdf`: uploads the full source PDF through the Gemini Files API.
- `openai_file`: sends the full source PDF through the OpenAI-compatible file
  input path.
- `page_images`: already renders sequential whole-document chunks; this PR
  preserves that behavior and does not claim selective savings for it.
- confirmed manual `segmented_full_pdf`: retains its existing masked-boundary
  execution priority.
- packet and batch plans carry original source page numbers; sequential chunks
  already remap local provider page refs back to original source pages.
- durable question creation remains after provider-response normalization in
  `importBatchImportJson`; source PDFs and questions are never mutated merely
  by planning.
- PR4-L telemetry records provider usage, estimated cost, queue wait, provider
  latency, execution latency, attempts, fallback state, and drafts created in
  admin-only telemetry.

## Selective Execution Contract

The new field is:

```text
summary.aiPdfImport.selectiveExecutionPlan
```

Version: `ai_pdf_selective_execution_v1`.

It contains only bounded planning metadata: mode, eligibility, selected/context
page counts, merged windows, packet references, original-to-local page mapping,
safe reason codes, warnings, and optional aggregate token usage. It never
contains PDF bytes, base64, signed URLs, prompts, provider responses, or
credentials.

For an eligible plan, the selected source pages are rendered in original order
into an in-memory subset PDF using the repository's existing secure masked-PDF
materializer with no masks. The prompt explicitly labels local subset pages and
the normalization layer maps returned `page_refs` and asset-page values back to
original PDF page numbers before any durable import work begins.

## Conservative Eligibility Policy

Selective execution requires all of the following:

- completed preanalysis, Packet Plan, and Extraction Batch Plan;
- a native PDF subset-capable strategy (`gemini_native_pdf` or `openai_file`);
- at least 6 source pages;
- no scanned-PDF warning;
- no non-empty unknown content pages;
- no high-confidence cross-page boundary risk;
- located answer/solution context whenever answer markers exist;
- at most 3 merged windows;
- at least 25% expected page reduction; and
- no more than 75% of the source pages sent after one-page context halos.

Question, answer, visual, boundary-risk, and adjacent context pages are
included before merging windows. Any unmet condition records a safe fallback
reason and uses the intact full-document path. `page_images`, mock, unsupported
providers, short/dense sources, manual boundary segmentation, and failed subset
materialization all fall back without inventing token savings.

## Telemetry And Cost Measurement

Provider token usage received from native PDF calls is preserved as an aggregate
per selective execution window when supplied. PR4-L's service-role-only
telemetry remains the cost and latency source of truth: it records actual usage
when the provider supplies it and catalog-derived estimates separately. Missing
provider usage remains null; this PR does not fabricate an exact cost or token
count.

The plan's `estimatedPageReductionRatio` is an input-page estimate, not a claim
of realized provider billing savings. Real savings should be compared in the
admin-only operations dashboard using telemetry from like-for-like imports.

## Validation

`scripts/ai-parsing-selective-packet-execution-smoke.mjs` verifies:

- sparse, well-classified native PDFs build merged windows with context halos;
- complete local-to-original page mapping is preserved;
- high boundary risk, unknown content, short/dense documents, and unsupported
  page-image inputs safely fall back to full-document execution;
- safe usage aggregates can be recorded without provider payloads;
- existing preanalysis, packet, batch, and target-Bank lineage fields survive
  the summary merge; and
- the service continues to use the Bank-scoped Review Draft import boundary.

The queue E2E fixture now also builds a valid 12-page synthetic source with two
question pages, answer context, and blank pages. Its local-only
`--validate-selective-fixture` mode runs actual PDF page counting, preanalysis,
packet/batch planning, and selective execution planning. It selected 9 of 12
pages while preserving original-page mapping. During this validation, a global
regex-state carryover bug was found in preanalysis and corrected by resetting
`lastIndex` before each per-page `matchAll` call.

One bounded real Gemini Native queue call was attempted after the implementation
work. The worker reached the provider but received a safe `403` from
`generateContent`; no provider response body was logged or retained. The smoke
cleanup removed its synthetic source, Bank, batch, draft, and job fixtures. The
real completion comparison remains blocked by provider authorization, so no
actual token/cost/latency savings are claimed. Once provider access is restored,
run the same bounded queue E2E and compare its PR4-L admin-only telemetry with
an equivalent full-document fixture.

## Migration And Rollback Risk

No migration was added or changed. Clean migrations `0033` through `0036` were
not rerun or modified. Rollback is code-only: removing the selective decision
would restore full-document provider input while leaving existing summaries and
private review data intact.
