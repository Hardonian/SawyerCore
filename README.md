# SawyerCore

SawyerCore is a Rust-first, deterministic edge AI runtime and agent simulation engine designed for local/edge CPU hardware.

## Workspace layout

- `crates/sawyer-core` runtime composition and benchmark harness
- `crates/sawyer-scheduler` deterministic fixed-step scheduler
- `crates/sawyer-memory` arena/memory pool abstraction
- `crates/sawyer-kernels` CPU capability detection and kernel dispatch
- `crates/sawyer-llm` local adapter interfaces and model registry
- `crates/sawyer-sim` deterministic event queue and replay engine
- `crates/sawyer-server` localhost-first HTTP API
- `crates/sawyer-cli` operator CLI (`sawyer`)

## Quick start

```bash
cargo build
cargo run -p sawyer-cli -- doctor
cargo run -p sawyer-cli -- sim run
cargo run -p sawyer-cli -- models list
cargo run -p sawyer-cli -- serve --bind 127.0.0.1:8080
```

## Verification commands

```bash
make fmt
make lint
make test
make build
make bench
make verify
```

## API routes

- `GET /health`
- `GET /status`
- `GET /metrics`
- `POST /v1/chat/completions` (OpenAI-compatible route shape; returns degraded state when unavailable)
- `POST /sim/run`

## Security defaults

- localhost-first bind defaults (`127.0.0.1:8080`)
- request body limit 1MB
- structured degraded errors for unavailable model runtime
- graceful shutdown on `CTRL+C`

See docs in `docs/` and examples in `examples/`.
