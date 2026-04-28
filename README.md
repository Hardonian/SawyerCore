# SawyerCore

Production-oriented deterministic edge AI runtime + governance engine.

## Verification-first quickstart

```bash
npm install
npm run sawyer:init -- --auto
npm run sawyer:doctor
npm run verify:ai
npm run verify:policy
npm run verify:runtime
npm run verify:config
npm run verify:recommendations
```

Rust-first fallback when Node tooling is unavailable:

```bash
./scripts/verify-rust-only.sh
```

## Runtime truth states

### IMPLEMENTED
- Deterministic task routing through contract -> policy -> provider health -> optimizer -> provider call -> audit event.
- Real bounded HTTP transport scaffolding for vLLM/LiteLLM (`GET /v1/models`, `POST /v1/chat/completions`, timeout + retry budget).
- `sawyer:doctor` table + `--json` output with nonzero exit only on invalid/unsafe config.
- Append-only local JSONL audit sink + in-memory sink for tests.

### CONFIG-DEPENDENT
- Live endpoint reachability and model discovery.
- Provider enablement, fallback policy, token/cost limits, and request size caps.

### STUBBED
- ONNX and Mobile NPU execution backends remain architecture stubs.

### FUTURE
- Full production model adapters and richer runtime telemetry.

## Key guarantees
- Fail-closed policy enforcement for unsafe/invalid config.
- No cloud fallback by default.
- Truthful degraded states over fake success.
