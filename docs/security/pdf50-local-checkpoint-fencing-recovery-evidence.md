# PDF50 Local Checkpoint Fencing Recovery Evidence

- Run ID: `pdf50-0051-1784684373591-a3712016`
- Classification: `PDF50_2_0051_LOCAL_RUNTIME_VALIDATED`
- Hosted database/API calls: 0
- Real Provider calls: 0
- Redaction: credentials, URLs with credentials, raw provider payloads, source content, prompts, and user identities omitted.

```json
{
  "classification": "PDF50_2_0051_LOCAL_RUNTIME_VALIDATED",
  "environment": {
    "gatesConfirmed": true,
    "databaseHost": "127.0.0.1",
    "databasePort": "54322",
    "apiHost": "127.0.0.1",
    "apiPort": "54321",
    "remoteEnvironmentPresent": false,
    "providerEnvironmentPresent": false
  },
  "preflight": {
    "branch": "codex/pdf50-worker-checkpoint-fencing-foundation",
    "requiredSourceCommit": "e17bae9",
    "sourceCommit": "e17bae9",
    "sourceCommitIsAncestor": true,
    "currentHead": "e17bae9",
    "currentFullHead": "e17bae9f65ba8b2efdb19b21db3ac6c97e7c6220",
    "worktreeCleanAtRunnerStart": false,
    "currentWorktreeChanges": 7,
    "validationDeltaOnly": true,
    "validationDeltaPaths": [
      "docs/security/pdf50-local-0050-0051-upgrade-evidence.md",
      "docs/security/pdf50-local-0051-fresh-chain-evidence.md",
      "docs/security/pdf50-local-checkpoint-fencing-recovery-evidence.md",
      "scripts/ai-provider-fallback-chaos-smoke.mjs",
      "scripts/ai-provider-resilience-smoke.mjs",
      "scripts/pdf50-local-0051-release-gate.mjs",
      "scripts/supabase-rls-smoke.mjs"
    ],
    "activeApplyPlanCount": 51,
    "canonicalHead": "0051_pdf50_worker_checkpoint_fencing.sql",
    "duplicateRawPrefixCount": 1,
    "duplicateRawPrefixes": [
      32
    ],
    "raw0051Count": 1,
    "laterMigrationConflictCount": 0,
    "legacyMigrationExecutable": false,
    "frozen0050Object": "a0c28735a1e1fe88c8d4c5a90cc2e37ae183093d",
    "limits": {
      "globalActive": 3,
      "organizationActive": 1,
      "pdfActive": 1,
      "userOutstanding": 5,
      "organizationOutstanding": 12,
      "workerInvocationMaximum": 2
    }
  },
  "fencing": {
    "firstLeaseGeneration": 1,
    "secondLeaseGeneration": 2,
    "heartbeat": "APPLIED",
    "staleFenceRejectionCount": 4,
    "recoveryCompletion": "APPLIED"
  },
  "serviceRoleRls": {
    "requesterRpcDeniedCount": 4,
    "requesterPrivateCheckpointDenied": true,
    "requesterFenceReplacementDenied": true,
    "serviceRoleExactWorkerOpsPassed": true
  },
  "recovery": {
    "casesPassed": 20,
    "providerCalls": 1,
    "providerCallsAvoided": 1,
    "staleFenceRejectionCount": 3,
    "oneLogicalDraftSet": true,
    "finalOutcome": "completed",
    "corruptCheckpointRejected": true,
    "incompatibleCheckpointRejected": true,
    "retryBudgetExhaustedFinalState": "failed"
  },
  "load": {
    "seeds": [
      1,
      7,
      19,
      37,
      73
    ],
    "jobs": 50,
    "completed": 50,
    "rounds": 50,
    "fakeProviderCalls": 50,
    "duplicateDrafts": 0,
    "staleFenceRejections": 50,
    "firstProgressOrganizationCount": 10,
    "activeLeasesAfter": 0,
    "concurrencyLimits": {
      "globalActive": 3,
      "organizationActive": 1,
      "pdfActive": 1,
      "userOutstanding": 5,
      "organizationOutstanding": 12,
      "workerInvocationMaximum": 2
    }
  },
  "telemetry": {
    "safeBoundedTelemetryFields": [
      "stage",
      "checkpoint recovery",
      "stale-fence rejection",
      "provider checkpoint reused",
      "Provider call avoided",
      "persistence replay",
      "duplicate output prevented",
      "lease generation category",
      "latency bucket",
      "recovery outcome"
    ],
    "providerOperationLogRowsDuringGate": 0,
    "unsafeLogFieldScanPassed": true
  },
  "cleanup": {
    "authCleanup": true,
    "databaseCleanup": true,
    "storageCleanup": true,
    "generatedFileCleanup": true,
    "processCleanup": true,
    "syntheticResidueCount": 0
  },
  "regression": {
    "skipped": false,
    "commands": [
      {
        "command": "node scripts/pdf50-worker-checkpoint-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS PDF50 worker checkpoint source contract"
        ]
      },
      {
        "command": "node scripts/pdf50-worker-fencing-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS PDF50 worker immutable lease fencing and stale rejection"
        ]
      },
      {
        "command": "node scripts/pdf50-worker-crash-recovery-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS corrupt_or_incompatible_checkpoint",
          "PASS two_recovery_workers_race",
          "PASS persistence_replay",
          "PASS retry_budget_exhaustion",
          "PASS PDF50 worker crash recovery matrix (20 cases, local fake provider)"
        ]
      },
      {
        "command": "node scripts/pdf50-worker-checkpoint-load-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS PDF50 checkpoint load and scheduler simulation (5 deterministic 50-job seeds)"
        ]
      },
      {
        "command": "node scripts/durable-ai-job-queue-load-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS durable AI job queue load smoke (180 jobs, 60 rounds)"
        ]
      },
      {
        "command": "node scripts/ai-jobs-scheduler-simulation.mjs",
        "status": 0,
        "summary": [
          "PASS AI jobs scheduler simulation (6 trusted bounded invocations, no network or provider calls)"
        ]
      },
      {
        "command": "node scripts/ai-provider-fallback-circuit-breaker-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS AI provider fallback circuit breaker smoke"
        ]
      },
      {
        "command": "node scripts/ai-provider-fallback-chaos-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS local teacher, unrelated teacher, and student cannot read routing or circuit state",
          "PASS local primary/fallback routing uses one bounded attempt budget without a provider call",
          "PASS local closed/open/half-open, atomic probe, stale lease, recovery, and reopen validation",
          "PASS local operation/provider circuit isolation preserves safe runtime-state metadata",
          "PASS local routing/circuit smoke cleanup removed exact synthetic rows"
        ]
      },
      {
        "command": "node scripts/ai-provider-resilience-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS AI provider resilience smoke"
        ]
      },
      {
        "command": "node scripts/canonical-migration-governance-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS raw duplicate 0032 is detected and explicitly classified",
          "PASS executable 0032 is teacher feedback notes; Google 0032 is excluded",
          "PASS canonical registrations 0044-0051 are ordered and complete",
          "PASS fresh-chain enumeration is manifest-driven with canonical head 0051",
          "PASS legacy migrations are absent from the executable plan"
        ]
      },
      {
        "command": "node scripts/migration-reconciliation-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS canonical migrations 0044-0051 have explicit number/classification/order",
          "PASS manifest-driven executable chain has canonical head 0051",
          "PASS canonical RLS policy inventory: 91 tables",
          "PASS historical 0039-0041 hashes remain unchanged",
          "STATUS PARTIALLY_CAPTURED_PROVIDER_GATEWAY_POST_0042: 1 known live authorization object(s) await owner decision"
        ]
      },
      {
        "command": "node scripts/security-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS question blueprint generation is DeepSeek-only, original-draft, and Review-only",
          "PASS question blueprint repair loop is bounded, validator-guided, and model-quality aware",
          "PASS question blueprint calibration is DeepSeek-only, temporary, and readiness-gated",
          "PASS blueprint observation mode is explicit, summary-only, and draft-free",
          "PASS question blueprint library admin surface has lifecycle gates and manual Review-Draft handoff"
        ]
      },
      {
        "command": "node scripts/supabase-rls-smoke.mjs",
        "status": 0,
        "summary": [
          "PASS assignment-from-bank migration keeps bank content assignment-scoped",
          "PASS teacher role/bank boundary migration protects public/global reads",
          "PASS teacher Blueprint Library migration protects private library and bank links",
          "PASS canonical Blueprint Engine migration enables staff-scoped RLS",
          "PASS PDF50 localhost-only RLS smoke source checks; generic anon live taxonomy probes skipped"
        ]
      },
      {
        "command": "node scripts/route-smoke.mjs --source-only",
        "status": 0,
        "summary": [
          "PASS /admin/blueprints source exposes lifecycle-gated DeepSeek draft generation safely",
          "PASS AI PDF dashboard source surfaces blueprint observation clusters",
          "PASS AI PDF blueprint observation completion handoff is visible",
          "PASS durable AI worker trigger source is internal-only",
          "PASS route smoke uses taxonomy routes without legacy tag setup"
        ]
      },
      {
        "command": "npm.cmd run lint",
        "status": 0,
        "summary": [
          "> o2i-web-dev@0.1.0 lint",
          "> node scripts/check-math-content-usage.mjs && node scripts/check-question-assets-public-url.mjs && node ./node_modules/eslint/bin/eslint.js .",
          "Question-assets public-URL guardrail passed (src/ is clean)."
        ]
      },
      {
        "command": "npm.cmd run build",
        "status": 0,
        "summary": [
          "? ? /unauthorized",
          "? ? /videos",
          "? ? /videos/[id]",
          "?  (Static)   prerendered as static content",
          "?  (Dynamic)  server-rendered on demand"
        ]
      },
      {
        "command": "npm.cmd run perf:budget",
        "status": 0,
        "summary": [
          "/admin/blueprints/sources: 145 B gzip / 40.0 KB",
          "/questions: 4.3 KB gzip / 30.0 KB",
          "/videos: 1.9 KB gzip / 20.0 KB",
          "PASS route budget guard checked available perf:audit route chunks.",
          "PASS performance budget smoke"
        ]
      },
      {
        "command": "npm.cmd run analyze",
        "status": 0,
        "summary": [
          "? ? /unauthorized",
          "? ? /videos",
          "? ? /videos/[id]",
          "?  (Static)   prerendered as static content",
          "?  (Dynamic)  server-rendered on demand"
        ]
      },
      {
        "command": "git diff --check",
        "status": 0,
        "summary": []
      }
    ]
  }
}
```

## Additional Exact Route Smoke

- Command: `node scripts/route-smoke.mjs`
- Server: local `next start` bound to `127.0.0.1:3000`
- Result: exit 0
- Cleanup: local Next process stopped and temporary logs removed
