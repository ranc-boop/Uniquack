# Vertex Model Routing Matrix

Status: target policy, subject to model availability and quota verification

Audit date: 2026-07-19

## 1. Availability warning

Model names in a product roadmap are not proof that the same endpoint is enabled in both intended Vertex projects and regions. Before a model is enabled, an operator must record its exact API model ID, product surface, launch stage, region, quota mode, context/file limits, pricing, retirement date, and successful contract test in both projects.

Official evidence found during this source audit:

- Google announced `gemini-3.1-flash-lite` in Vertex release notes as a high-volume, cost-sensitive model; its launch stage has changed over time, so deployment must verify the current model card and region.
- Google publishes samples using `gemini-3.5-flash`, but project/region access still requires verification.
- Current public Vertex embedding documentation confirms `gemini-embedding-001`; it does not confirm `gemini-embedding-2` as an API ID.
- Google documentation lists `mistral-ocr-2505` under the Mistral partner-model surface and `deepseek-ocr-maas` as a DeepSeek OCR MaaS model. They require separate adapter, entitlement, residency, and quota checks.
- Vertex release notes moved Gemini 2.5 model retirement to October 16, 2026. It is benchmark-only here and must not become the canonical default.

Primary sources:

- [Vertex AI generative AI release notes](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/release-notes)
- [Vertex text embeddings](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings)
- [Google sample using gemini-3.5-flash](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/samples/googlegenaisdk-batchpredict-with-gcs)
- [Mistral partner models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/mistral)
- [DeepSeek OCR model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/maas/deepseek/deepseek-ocr)

## 2. Target model matrix

| Role | Intended model | Use | Launch policy | Hard gate |
|---|---|---|---|---|
| Primary extraction | `gemini-3.1-flash-lite` | Full-PDF multimodal structure extraction | Canonical primary after validation | Available in both projects/region; contract, quality, quota, and cost tests pass |
| Quality escalation | `gemini-3.5-flash` | Re-read ambiguous/low-quality extraction | Conditional only | Exact Vertex availability, context/file support, price, and schema contract verified |
| Temporary benchmark | `gemini-2.5-flash-lite` | Compare regression/cost before retirement | Never default; time-bounded | Retirement guard and removal date configured |
| OCR candidate A | `mistral-ocr-2505` | Text/layout extraction for image-heavy pages | Optional benchmark | Correct Google product endpoint, commercial terms, residency, and adapter verified |
| OCR candidate B | `deepseek-ocr-maas` | Alternate OCR benchmark | Optional benchmark | MaaS access, region, content handling, safety, and quota verified |
| Embedding target | `gemini-embedding-2` requested | Search/recommendation vectors after extraction | Blocked pending exact ID | Official API ID and availability confirmed |
| Embedding documented fallback | `gemini-embedding-001` | Candidate if product approves | Not an automatic substitution | Dimensions, cost, quality, and re-embedding plan approved |

The plan retains the requested `gemini-embedding-2` intent but does not pretend it is currently verified. Product approval is required before substituting `gemini-embedding-001`.

## 3. Operation routing

| Operation | First choice | Escalation/fallback | Must not happen |
|---|---|---|---|
| PDF structure extraction | 3.1 Flash-Lite on least-loaded healthy project | Peer project on retryable availability error; 3.5 Flash on quality signal | Use visible question number as identity; publish drafts |
| Ambiguous page re-read | 3.5 Flash on healthy project | Peer project; reviewer warning on unresolved conflict | Blindly concatenate conflicting content |
| OCR | Approved OCR adapter for selected pages only | Second OCR candidate only if separately qualified | Send every PDF to OCR by default |
| Normalize/validate | Deterministic application code | One bounded model repair only if policy allows | Retry invalid contract indefinitely |
| Embedding | Approved embedding model after extraction | Durable low-priority retry | Block Review Draft availability |
| Deterministic grading | Existing deterministic logic | None | Route to any AI provider |

## 4. Escalation criteria

Escalation is not "try a larger model whenever the first output looks imperfect." It requires an allowlisted machine-readable signal:

- invalid schema remains after deterministic normalization;
- extracted coverage is below a configured source-page threshold;
- cross-page continuation is unresolved;
- required fields are missing across multiple questions;
- text layer is absent or below OCR threshold;
- model returns a bounded low-confidence/needs-review marker supported by validation;
- reviewer explicitly retries with quality escalation.

Duplicate or missing visible question numbers produce warnings, not escalation by themselves. Content-policy, permission, invalid-file, and unsupported-model errors do not escalate to another model.

## 5. Initial concurrency envelope

| Capacity key | Project A | Project B | Total | Promotion rule |
|---|---:|---:|---:|---|
| Primary PDF extraction | 2 | 2 | 4 | Start at 1+1; raise only after 25-PDF gate and quota headroom |
| Quality escalation | 1 | 1 | 2 | Independent budget and latency gate |
| OCR candidate | 1 | 1 | 2 maximum | Start with one global slot per qualified adapter |
| Embedding | 4 | 4 | 8 | Batch where supported; lower priority than extraction |
| Total PDF provider calls | 3 | 3 | 6 | Primary plus escalation/OCR limits still apply |

All values are configuration. Capacity is keyed by `(environment, project alias, region, model ID, operation)` and acquired atomically. A global burst limit and per-organization fairness limit sit above these slots.

## 6. Selection algorithm

```text
candidates = compatible(operation, model_role)
candidates -= disabled + lifecycle_blocked + circuit_open + cooldown + full

score =
  0.50 * active_slots_ratio
  + 0.20 * rolling_429_ratio
  + 0.20 * normalized_p95_latency
  + 0.10 * recent_failure_ratio

choose minimum score
break ties with stable hash(job_id, attempt, target_alias)
atomically acquire capacity lease
```

The hash is only a tie-breaker. It must not override health or capacity. The selected target is recorded as a safe alias such as `vertex-a`, not a cloud project identifier in ordinary UI.

## 7. Failure and fallback policy

| Failure | Same-target request retry | Peer project | Model escalation | Durable job retry |
|---|---|---|---|---|
| Network/timeout | Bounded | Yes | No | Yes |
| 429/quota pressure | At most one if Retry-After is short | Yes after cooldown set | No | Yes with jitter |
| 5xx | Bounded | Yes | No | Yes |
| Invalid JSON/schema | Deterministic repair first | No | Maybe, by quality policy | No blind retry |
| 400 invalid request | No | No | No | Final configuration failure |
| 401/403 | No | No | No | Disable target and alert |
| Unsupported model/region | No | No | No | Lifecycle/configuration failure |
| Content policy | No | No | No | Reviewable safe failure |

Project cooldown is durable and separate from the existing provider-profile circuit. Honor `Retry-After` within configured 5-second to 15-minute bounds; otherwise use exponential full jitter. One project cooling down does not open the peer project's circuit.

## 8. Model lifecycle controls

Every model deployment record should include:

- immutable API model ID and product surface;
- role: primary, quality, OCR, embedding, or benchmark;
- launch stage and region allowlist;
- enabled environments/projects;
- effective and verified dates;
- retirement/deprecation date and internal disable deadline;
- replacement model and benchmark status;
- parser/prompt/schema contract version;
- maximum input/file/page limits;
- cost catalog version and budget class;
- last successful synthetic contract test.

Controls:

1. Block a model after its internal disable deadline even if an old profile remains enabled.
2. Alert 90/60/30/14/7 days before retirement.
3. Require two-project contract tests before promotion.
4. Keep benchmark models out of default routing.
5. Version output contracts so model changes cannot silently alter persistence.
6. Roll back through configuration to the last qualified model; never rewrite historical model metadata.

## 9. Telemetry without sensitive data

Safe proof of routing is a tuple of environment, operation, target alias, model role, model ID, route position, attempt number, fallback/escalation boolean, status class, latency bucket, token/page aggregates, and circuit/cooldown outcome. Do not record credentials, raw cloud project IDs in user-visible logs, PDF content, prompts, model responses, signed URLs, student data, or provider headers.
