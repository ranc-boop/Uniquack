# Gemini Parsing Efficiency Baseline

## Frozen evidence

The comparison anchor is
`f1ce7bcb791604468693ea945401cfb157e64d97`. The configured live route used the
Gemini Developer API raw REST `v1beta` `generateContent` contract with
`gemini-2.5-flash-lite`, `responseMimeType=application/json`, and
`responseJsonSchema`.

The existing paid evidence is not rerun:

- four-file stage: 4/4 completed, 4 inference requests, 31,104 input tokens,
  1,704 output tokens, and 3,794 micros estimated actual cost in the passing
  iteration;
- ten-file stage: passed its final 9-completed/1-cancelled contract after
  earlier bounded correction runs;
- fifty-file stage: 50 admitted, 51st rejected, 23 completed, 48 inference
  requests, 96 uploads, 48 cleanups, and 192 total Provider requests before the
  aggregate attempt reservation failed closed;
- 25 attempts exceeded the one-base-attempt count for 23 completions;
- six exact jobs entered retry waits in recorded evidence;
- the remaining authorized conservative budget is USD 0.133279, below the
  USD 0.331950 one-attempt-per-file minimum for a fresh 50-file run.

Historical telemetry does not distinguish structural repair, transient
transport retry, fallback, semantic recovery, or durable retry. The correct
classification for those 25 extra attempts is `LEGACY_REASON_UNKNOWN`.

## Treatment hypothesis

Structural repair previously repeated the full PDF or retained file/image
messages. The treatment sends bounded previous output plus safe validation
feedback without source bytes for non-JSON or application-schema repair. A
zero-importable response retains one source-backed recovery because source
understanding may genuinely be missing.

The quality observer now measures attempt reasons, repeated source bytes,
context composition, token usage when available, valid Drafts, and visual
outcomes. A local ablation proves source repetition is removed from structural
repair. Its synthetic context accounting is 169,514 baseline bytes and 194,865
treatment bytes; the larger treatment total includes the new quality and visual
contracts, while the repair-specific source repetition is zero. It does not
claim a paid latency, token, quality, or cost improvement.

The historical 50-file evidence cannot truthfully reconstruct first-attempt
success or a reason histogram. It records 48 inference requests, 23 durable
completions, 25 attempts above those completed-job base attempts, and six retry
waits. Every historical extra attempt therefore remains
`LEGACY_REASON_UNKNOWN`. Treatment runs will emit an explicit attempt reason and
safe Provider error category at the time of execution.

## Next valid experiment

A future authorized run must compare baseline and treatment on identical
fixtures, Provider profile, model, output-token limit, and total attempt/cost
budget. It must report hard-zero gates and blind quality before accepting any
efficiency improvement. The present scale evidence remains partial.
