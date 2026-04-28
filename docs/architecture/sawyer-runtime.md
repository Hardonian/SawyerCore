# Sawyer Runtime

## IMPLEMENTED
- Deterministic routing engine with optimization scoring over latency/cost/privacy/hardware/failure history.
- Provider abstraction layer (`healthCheck`, `estimateCost`, `estimateLatency`, `supportsTask`, `runInference`, `getCapabilities`).
- Task contracts for chat/summarization/code/embedding/classification + placeholders.
- Audit event emission on allow/deny paths.

## STUBBED
- Real hardware telemetry collection.
- Real model invocation APIs.

## CONFIG-DEPENDENT
- Provider enablement and endpoint URLs.
- Fallback behavior and cost caps.

## FUTURE
- Online learning score tuning and SLO-aware adaptive routing.
