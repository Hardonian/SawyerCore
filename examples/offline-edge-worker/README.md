# Offline Edge Worker Recipe

Demonstrates how SawyerCore handles intermittent connectivity, air-gapped field operations, and local task queueing.

## Key Features
- **Deterministic Offline Execution**: Tasks are queued and executed locally without hanging or crashing.
- **Fail-Safe Persistence**: Tasks are retained across device restarts.
- **Automatic Sync Manager**: Batches and drains local queues once network health is re-established.

## Running the Worker

```bash
npx tsx examples/offline-edge-worker/worker.ts
```
