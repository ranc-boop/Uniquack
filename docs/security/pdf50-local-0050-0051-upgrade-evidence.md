# PDF50 Local 0050 to 0051 Upgrade Evidence

- Run ID: `pdf50-0051-1784691544638-d725f58e`
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
    "fakeProviderOnly": true,
    "remoteEnvironmentPresent": false,
    "providerEnvironmentPresent": false
  },
  "preflight": {
    "branch": "codex/pdf50-worker-checkpoint-fencing-foundation",
    "requiredSourceCommit": "e17bae9",
    "sourceCommit": "e17bae9",
    "sourceCommitIsAncestor": true,
    "currentHead": "73bbb3e",
    "currentFullHead": "73bbb3ea3375ce5bd6622a80b93fbaa6092705e9",
    "worktreeCleanAtRunnerStart": false,
    "currentWorktreeChanges": 6,
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
          "id": "2b252354-5fc8-46ba-a59f-3a6028d1baf0",
          "status": "draft",
          "link": "715bc156-4f5c-42de-8d74-5a6f897f0f10"
        },
        {
          "kind": "batch",
          "id": "334aeb2b-b4a7-4077-9967-99063c319a90",
          "status": "draft",
          "link": "715bc156-4f5c-42de-8d74-5a6f897f0f10"
        },
        {
          "kind": "batch",
          "id": "35f91dc1-0698-41e8-ba0e-1c140f2c1335",
          "status": "draft",
          "link": "715bc156-4f5c-42de-8d74-5a6f897f0f10"
        },
        {
          "kind": "batch",
          "id": "6b7ffc3f-53f1-4091-bb15-572be2b684e0",
          "status": "draft",
          "link": "715bc156-4f5c-42de-8d74-5a6f897f0f10"
        },
        {
          "kind": "burst",
          "id": "9700daa6-dfa6-4a43-abfc-3fa50207d296",
          "status": "queued",
          "link": "715bc156-4f5c-42de-8d74-5a6f897f0f10"
        },
        {
          "kind": "job",
          "id": "3781d930-7b6a-4d34-864b-52878be0675e",
          "status": "queued",
          "link": "35f91dc1-0698-41e8-ba0e-1c140f2c1335"
        },
        {
          "kind": "job",
          "id": "51337aaf-7cde-4b5c-a217-fd36803c4981",
          "status": "retry_wait",
          "link": "6b7ffc3f-53f1-4091-bb15-572be2b684e0"
        },
        {
          "kind": "job",
          "id": "d5376dc9-58dc-4867-968c-036d4ba7239d",
          "status": "completed",
          "link": "334aeb2b-b4a7-4077-9967-99063c319a90"
        },
        {
          "kind": "job",
          "id": "e5958a57-96c8-47c0-9391-5427d798cb2c",
          "status": "leased",
          "link": "2b252354-5fc8-46ba-a59f-3a6028d1baf0"
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
          "id": "2b252354-5fc8-46ba-a59f-3a6028d1baf0",
          "status": "draft",
          "link": "715bc156-4f5c-42de-8d74-5a6f897f0f10"
        },
        {
          "kind": "batch",
          "id": "334aeb2b-b4a7-4077-9967-99063c319a90",
          "status": "draft",
          "link": "715bc156-4f5c-42de-8d74-5a6f897f0f10"
        },
        {
          "kind": "batch",
          "id": "35f91dc1-0698-41e8-ba0e-1c140f2c1335",
          "status": "draft",
          "link": "715bc156-4f5c-42de-8d74-5a6f897f0f10"
        },
        {
          "kind": "batch",
          "id": "6b7ffc3f-53f1-4091-bb15-572be2b684e0",
          "status": "draft",
          "link": "715bc156-4f5c-42de-8d74-5a6f897f0f10"
        },
        {
          "kind": "burst",
          "id": "9700daa6-dfa6-4a43-abfc-3fa50207d296",
          "status": "queued",
          "link": "715bc156-4f5c-42de-8d74-5a6f897f0f10"
        },
        {
          "kind": "job",
          "id": "3781d930-7b6a-4d34-864b-52878be0675e",
          "status": "queued",
          "link": "35f91dc1-0698-41e8-ba0e-1c140f2c1335"
        },
        {
          "kind": "job",
          "id": "51337aaf-7cde-4b5c-a217-fd36803c4981",
          "status": "retry_wait",
          "link": "6b7ffc3f-53f1-4091-bb15-572be2b684e0"
        },
        {
          "kind": "job",
          "id": "d5376dc9-58dc-4867-968c-036d4ba7239d",
          "status": "completed",
          "link": "334aeb2b-b4a7-4077-9967-99063c319a90"
        },
        {
          "kind": "job",
          "id": "e5958a57-96c8-47c0-9391-5427d798cb2c",
          "status": "leased",
          "link": "2b252354-5fc8-46ba-a59f-3a6028d1baf0"
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
