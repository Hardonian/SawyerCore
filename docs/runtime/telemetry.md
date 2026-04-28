# Telemetry Runtime Contract

Captured per request:

- request/task metadata
- selected and rejected providers
- latency/cost/success/degraded state
- token count (if known)
- memory snapshot (if available)
- device profile snapshot (if available)

## Storage

- local JSONL at `./var/telemetry/requests.jsonl`
- in-memory rolling window
- optional gzip archive when telemetry archive feature is enabled

## Privacy

Telemetry excludes secrets and raw prompts by design.
