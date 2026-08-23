# SawyerCore

SawyerCore is a local-first AI runtime that decides where an AI task should run safely.

## Prerequisites

- **Node.js >=20** — [nodejs.org](https://nodejs.org)
- **Rust toolchain** — [rustup.rs](https://rustup.rs) (pinned to 1.90.0 via `rust-toolchain.toml`)
- **Git**

## Quick setup

```bash
git clone https://github.com/example/SawyerCore.git
cd SawyerCore
npm ci
cargo build --workspace
```

## Start the server

```bash
cargo run -p sawyer-cli -- serve
```

The server starts on `http://127.0.0.1:8787` by default.

## What you get

- **Policy Engine**: Resource-aware policy enforcement for autonomous actions.
- **Ecosystem Layer**: Hardware-aware scheduling, offline-first AI OS behavior, and plugin marketplace.
- **Edge Intelligence**: Optimized for running on the edge with deterministic performance.
- Deterministic routing with explicit degraded states.
- Cloud disabled by default (local-safe posture).
- Runtime modes (`tiny`, `local`, `performance`, `gateway`, `dev`).
- Provider comparison with real localhost availability checks.
- Explainability output for the latest routing decision (`sawyer explain last` / `GET /explain/last`).

## Runtime modes

```bash
cargo run -p sawyer-cli -- mode list
cargo run -p sawyer-cli -- mode explain tiny
cargo run -p sawyer-cli -- mode set tiny
cargo run -p sawyer-cli -- mode current
```

## Beginner docs

- [Quickstart](QUICKSTART.md)
- [Concepts](docs/concepts.md)
- [Modes](docs/modes.md)
- [Model sizing](docs/model-sizing.md)
- [Single-binary deploy](docs/deploy/single-binary.md)
- [Contributing](CONTRIBUTING.md)
