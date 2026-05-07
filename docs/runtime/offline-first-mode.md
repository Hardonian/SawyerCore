# Offline-First Mode

SawyerCore is designed to remain functional even in network-isolated environments.

## Capabilities

1. **Local Execution**: Tasks supported by local models (e.g., Llama-3-8B) run fully offline.
2. **Task Queueing**: Tasks requiring remote capabilities (e.g., GPT-4) are queued with a unique trace ID.
3. **Trace Integrity**: Local results are produced with a `DEGRADED` or `OFFLINE` status, preserving the audit trail.
4. **Idempotent Sync**: When connectivity returns, the `OfflineSync` engine replays queued tasks and reconciles state.

## Operational States

- `ONLINE`: All remote and local capabilities available.
- `OFFLINE`: Only local capabilities available; others are queued.
- `DEGRADED`: Intermittent connectivity; sync in progress.

## Sync Conflict Detection

The system uses hash-based state verification to detect if the remote state has drifted during the offline period. Conflicts are logged for manual or rule-based reconciliation.
