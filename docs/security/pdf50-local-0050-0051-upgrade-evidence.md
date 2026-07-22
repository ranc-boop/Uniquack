# PDF50 Local 0050 to 0051 Upgrade Evidence

- Run ID: `pdf50-0051-1784684373591-a3712016`
- Classification: `PDF50_0051_UPGRADE_VALIDATED`
- Hosted database/API calls: 0
- Real Provider calls: 0
- Redaction: credentials, URLs with credentials, raw provider payloads, source content, prompts, and user identities omitted.

```json
{
  "classification": "PDF50_0051_UPGRADE_VALIDATED",
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
  "scenarioB": {
    "classification": "PDF50_0051_UPGRADE_VALIDATED",
    "baseHistory": {
      "hash": "32ce54c7c48dfde5d80915840da635ae44593353dc3e45ef500d88200c16926f",
      "totalRows": 50,
      "canonicalCount": 50,
      "canonicalHead": "0050",
      "canonical0050Count": 1,
      "canonical0051Count": 0,
      "duplicateCanonicalCount": 0,
      "pendingCanonicalCount": 1,
      "pendingCanonical": [
        "0051"
      ],
      "legacyExecutedCount": 0
    },
    "beforeFingerprint": {
      "hash": "5d65cb77c0e0118aea2ada4b6f75aabe3c707c35a324d826041c202379f7b0ff",
      "rows": [
        {
          "kind": "batch",
          "id": "538ca091-a5bd-4e51-bff8-2f89c1d54c4d",
          "status": "draft",
          "link": "8081f623-f7a8-4068-b620-a05a5a23c2ee"
        },
        {
          "kind": "batch",
          "id": "53bc97ec-b2bf-40b6-ac1a-8c485bdb6daf",
          "status": "draft",
          "link": "8081f623-f7a8-4068-b620-a05a5a23c2ee"
        },
        {
          "kind": "batch",
          "id": "8b7c77bc-bff1-4a6e-b7eb-7194fea8f1ac",
          "status": "draft",
          "link": "8081f623-f7a8-4068-b620-a05a5a23c2ee"
        },
        {
          "kind": "batch",
          "id": "c7729c3a-9928-4bba-9c77-3dd70bf95a55",
          "status": "draft",
          "link": "8081f623-f7a8-4068-b620-a05a5a23c2ee"
        },
        {
          "kind": "burst",
          "id": "6faf5cc2-97bb-43b0-a4c9-d49eec22b56a",
          "status": "queued",
          "link": "8081f623-f7a8-4068-b620-a05a5a23c2ee"
        },
        {
          "kind": "job",
          "id": "02a503f5-3f5c-48d7-958c-f3b6edca70c9",
          "status": "completed",
          "link": "8b7c77bc-bff1-4a6e-b7eb-7194fea8f1ac"
        },
        {
          "kind": "job",
          "id": "811618f8-a617-46f8-8460-7e84df8a413c",
          "status": "retry_wait",
          "link": "538ca091-a5bd-4e51-bff8-2f89c1d54c4d"
        },
        {
          "kind": "job",
          "id": "8243a45d-7f31-4202-9aff-b99ba97876d1",
          "status": "queued",
          "link": "53bc97ec-b2bf-40b6-ac1a-8c485bdb6daf"
        },
        {
          "kind": "job",
          "id": "f6563136-9e46-4499-954a-193451b71e4f",
          "status": "leased",
          "link": "c7729c3a-9928-4bba-9c77-3dd70bf95a55"
        }
      ]
    },
    "afterHistory": {
      "hash": "b801cb62be75f599bd10ff332733e52a0999e25485d878571001c8793b9ee8f5",
      "totalRows": 51,
      "canonicalCount": 51,
      "canonicalHead": "0051",
      "canonical0050Count": 1,
      "canonical0051Count": 1,
      "duplicateCanonicalCount": 0,
      "pendingCanonicalCount": 0,
      "pendingCanonical": [],
      "legacyExecutedCount": 0
    },
    "afterFingerprint": {
      "hash": "5d65cb77c0e0118aea2ada4b6f75aabe3c707c35a324d826041c202379f7b0ff",
      "rows": [
        {
          "kind": "batch",
          "id": "538ca091-a5bd-4e51-bff8-2f89c1d54c4d",
          "status": "draft",
          "link": "8081f623-f7a8-4068-b620-a05a5a23c2ee"
        },
        {
          "kind": "batch",
          "id": "53bc97ec-b2bf-40b6-ac1a-8c485bdb6daf",
          "status": "draft",
          "link": "8081f623-f7a8-4068-b620-a05a5a23c2ee"
        },
        {
          "kind": "batch",
          "id": "8b7c77bc-bff1-4a6e-b7eb-7194fea8f1ac",
          "status": "draft",
          "link": "8081f623-f7a8-4068-b620-a05a5a23c2ee"
        },
        {
          "kind": "batch",
          "id": "c7729c3a-9928-4bba-9c77-3dd70bf95a55",
          "status": "draft",
          "link": "8081f623-f7a8-4068-b620-a05a5a23c2ee"
        },
        {
          "kind": "burst",
          "id": "6faf5cc2-97bb-43b0-a4c9-d49eec22b56a",
          "status": "queued",
          "link": "8081f623-f7a8-4068-b620-a05a5a23c2ee"
        },
        {
          "kind": "job",
          "id": "02a503f5-3f5c-48d7-958c-f3b6edca70c9",
          "status": "completed",
          "link": "8b7c77bc-bff1-4a6e-b7eb-7194fea8f1ac"
        },
        {
          "kind": "job",
          "id": "811618f8-a617-46f8-8460-7e84df8a413c",
          "status": "retry_wait",
          "link": "538ca091-a5bd-4e51-bff8-2f89c1d54c4d"
        },
        {
          "kind": "job",
          "id": "8243a45d-7f31-4202-9aff-b99ba97876d1",
          "status": "queued",
          "link": "53bc97ec-b2bf-40b6-ac1a-8c485bdb6daf"
        },
        {
          "kind": "job",
          "id": "f6563136-9e46-4499-954a-193451b71e4f",
          "status": "leased",
          "link": "c7729c3a-9928-4bba-9c77-3dd70bf95a55"
        }
      ]
    },
    "secondPass": {
      "recognizedAlreadyApplied": true,
      "sqlExecuted": 0,
      "additionalHistoryRows": 0,
      "historyChanged": false
    },
    "schema": {
      "hash": "9e514181a67a5a6cf66081f3682ee302db59f968663c5db7f906e9255f00b759",
      "hasJobFenceColumns": true,
      "hasImportLineageColumn": true,
      "hasPrivateCheckpointTable": true,
      "constraintCount": 4,
      "indexCount": 1,
      "functionCount": 11,
      "triggerCount": 2,
      "providerCheckpointRlsEnabled": true,
      "providerCheckpointServiceOnlyTableGrant": true,
      "serviceOnlyFunctions": true,
      "hasAllFencedFunctions": true,
      "noAutoPublish": true,
      "noAssignmentCreation": true
    },
    "rls": {
      "requesterRpcDeniedCount": 4,
      "requesterPrivateCheckpointDenied": true,
      "requesterFenceReplacementDenied": true,
      "serviceRoleExactWorkerOpsPassed": true
    },
    "fencing": {
      "firstLeaseGeneration": 1,
      "secondLeaseGeneration": 2,
      "heartbeat": "APPLIED",
      "staleFenceRejectionCount": 4,
      "recoveryCompletion": "APPLIED"
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
    }
  }
}
```
