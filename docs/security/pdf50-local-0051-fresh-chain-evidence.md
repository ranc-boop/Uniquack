# PDF50 Local 0051 Fresh Chain Evidence

- Run ID: `pdf50-0051-1784691544638-d725f58e`
- Classification: `PDF50_0051_FRESH_CHAIN_VALIDATED`
- Hosted database/API calls: 0
- Real Provider calls: 0
- Redaction: credentials, URLs with credentials, raw provider payloads, source content, prompts, and user identities omitted.

```json
{
  "classification": "PDF50_0051_FRESH_CHAIN_VALIDATED",
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
  "scenarioA": {
    "classification": "PDF50_0051_FRESH_CHAIN_VALIDATED",
    "empty": {
      "publicTableCount": 0,
      "appRoutineCount": 0,
      "privateTableCount": 0,
      "migrationHistoryCount": 0,
      "authUserCount": 0,
      "storageObjectCount": 0
    },
    "applied": {
      "appliedCount": 51,
      "firstApplied": "0001_foundations_identity_organizations.sql",
      "lastApplied": "0051_pdf50_worker_checkpoint_fencing.sql"
    },
    "history": {
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
