# AI Parsing Question Boundary and Duplicate Guard

## Executive Summary

PR4-H adds a deterministic, review-only structural analysis layer after AI PDF
extraction creates normalized draft questions. It identifies likely duplicate
groups, original-versus-recovery duplicates, likely cross-page fragments,
question-number conflicts, answer alignment concerns, and visual association
risks. It never calls a provider, deletes or merges questions, changes
taxonomy, creates assignments, publishes content, or changes Review Draft
status.

## Prior State

The prior `codex/ai-parsing-question-boundary-duplicate-guard` branch was a
stale pointer with no implementation commits beyond `main`. Existing
adaptive-reread and coverage-recovery modules were safe planning foundations,
but did not analyze extracted question candidates or form deterministic
duplicate groups.

## Pipeline Insertion Point

`processAIPdfImport` now runs the guard after normalized draft questions have
been imported and after the existing extraction coverage/recovery planning
chain. The guard reloads the latest `import_batches.summary`, loads only the
newly created draft question metadata plus asset references, then merges:

```text
summary.aiPdfImport.questionBoundaryGuardPlan
```

into the current `aiPdfImport` object. Existing preanalysis, packet, batch,
adaptive reread, coverage-recovery, chunking, provider, source asset, target
bank, and created-question fields are preserved.

Guard persistence is advisory. A guard failure stores a safe failed result when
possible and never converts a successful extraction into a failed import.

## Duplicate Detection

The versioned result is `question_boundary_guard_v1`. It uses normalized text,
stable SHA-256 fingerprints, bounded token similarity, page overlap, visible
question numbers, source asset identity, and recovery provenance. High-risk
groups require same-source evidence plus exact or near-exact normalized stems
and overlapping pages, a matching visible number, or an original/recovery
pair. Similarity alone does not create a duplicate group.

Different numeric givens reduce duplicate confidence, same taxonomy is ignored,
and identical wording from separate source assets is not grouped. Matching
visible numbers with materially different content are reported as a numbering
conflict rather than a duplicate.

## Boundary and Association Detection

The guard reports review-only findings for:

- abrupt stems near a page/chunk boundary
- adjacent stem and choices/continuation fragments
- choices-only or solution-only items
- answer alignment risks
- preanalysis, adaptive reread, and recovery-planning page windows
- visual references without source asset evidence
- asset placeholder pages outside a question's page references
- multiple drafts claiming the same asset reference

The safe planning outputs from adaptive reread and coverage recovery are used
only as additional page-boundary evidence. Recovery execution remains
planning-only. If a future recovery result creates a candidate with recovery
provenance, this guard compares it with original candidates and flags possible
duplicates or fragment-completion pairs for human review.

## UI Behavior

Admin AI PDF status and teacher bank import history show a concise Structural
review card:

- no issues: `No likely duplicate or boundary conflicts were detected.`
- issues: severity counts and a concise review recommendation
- details: question numbers, pages, explanation, suggested review action, and
  expandable technical reason codes
- Review Draft CTA when an import has reviewable drafts

Bank Review Draft cards receive compact badges such as `Possible duplicate`,
`Check page boundary`, `Check answer alignment`, and `Check visual association`.
The question review panel shows the matching explanations and source pages.
No draft status or content is changed automatically.

## Safety Boundaries

- No AI provider call or retry behavior was added.
- No automatic duplicate deletion or fragment merge occurs.
- No Review Draft content or status is mutated by the guard.
- No taxonomy write, publish, assignment, or student UI behavior changed.
- No migration, provider configuration, or environment file changed.
- The teacher/admin UI receives concise review guidance only; raw provider
  output, signed URLs, and stack traces are not displayed.

## Files Changed

- `src/lib/ai-pdf-import/question-boundary-guard.ts`
- `src/lib/ai-pdf-import/service.ts`
- `src/components/ai-pdf-dashboard/question-boundary-guard-card.tsx`
- `src/components/ai-pdf-dashboard/ai-pdf-control-dashboard.tsx`
- `src/app/teacher/banks/bank-import-ui.tsx`
- `src/lib/question-banks.ts`
- `src/app/teacher/banks/[bankId]/review/page.tsx`
- `scripts/ai-parsing-boundary-duplicate-guard-smoke.mjs`
- `scripts/smoke-all.mjs`

## Smoke Coverage

The focused smoke covers:

1. exact same-source duplicate candidates
2. original/recovery duplicate candidates
3. cross-page stem/choices fragments
4. choices-only items
5. solution-only items
6. same visible number with different content
7. parameter variants that must not become exact duplicates
8. identical text from unrelated source assets
9. visual association risks
10. clean extraction without false high-risk findings
11. latest-summary merge preservation
12. advisory guard failure fallback
13. no provider, delete, insert, publish, or taxonomy mutation in the module

## Validation

Passed:

- `npm.cmd install`
- `npm.cmd run lint`
- `npm.cmd run build`
- `node scripts/security-smoke.mjs`
- `node scripts/route-smoke.mjs`
- `node scripts/ai-parsing-boundary-duplicate-guard-smoke.mjs`
- `node scripts/ai-parsing-status-review-qa-smoke.mjs`
- `node scripts/bank-import-review-smoke.mjs`
- `node scripts/supabase-rls-smoke.mjs`
- `npm.cmd run smoke`
- `npm.cmd run perf:budget`

`npm.cmd install` reported three existing moderate audit advisories; no package
or lockfile change was made for this PR.

## Remaining Limitations

- This layer is deterministic and evidence-based; it does not use embeddings,
  OCR repair, or computer vision.
- It flags review candidates but does not edit, merge, or resolve them.
- Recovery execution, provider retry/resilience, and durable queue behavior are
  intentionally outside this PR.
- A production import with a real provider remains a separate manual acceptance
  check; this PR made no provider call.

## Next Recommendation

Proceed with PR4-I provider resilience after manual review of the structural
guard results on a bounded real import.
