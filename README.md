# SawyerCore

SawyerCore is a local-first AI runtime that decides where an AI task should run safely.

## One-command start

```bash
cargo run -p sawyer-cli -- quickstart
```

Then launch:

```bash
cargo run -p sawyer-cli -- up
```

## What you get

- **Policy Engine**: Resource-aware policy enforcement for autonomous actions.
- **Ecosystem Layer**: Hardware-aware scheduling, offline-first AI OS behavior, and plugin marketplace.
- **Edge Intelligence**: Optimized for running on the edge with deterministic performance.
- Deterministic routing with explicit degraded states.
- Cloud disabled by default (local-safe posture).
- Runtime modes (`tiny`, `local`, `performance`, `gateway`, `dev`).
- Provider comparison with real localhost availability checks.
- Explainability output for the latest routing decision (`sawyer explain last` / `GET /explain/last`).

## Mode commands

```bash
cargo run -p sawyer-cli -- mode list
cargo run -p sawyer-cli -- mode explain tiny
cargo run -p sawyer-cli -- mode set tiny
cargo run -p sawyer-cli -- mode current
```

## Beginner docs

- [Quickstart](docs/quickstart.md)
- [Concepts](docs/concepts.md)
- [Modes](docs/modes.md)
- [Model sizing](docs/model-sizing.md)
- [Single-binary deploy](docs/deploy/single-binary.md)
