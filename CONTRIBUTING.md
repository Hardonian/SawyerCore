# Contributing to SawyerCore

## Getting Started

### Prerequisites
- Node.js >=20
- Rust toolchain (pinned in `rust-toolchain.toml`)
- Git

### Setup
```bash
git clone https://github.com/example/SawyerCore.git
cd SawyerCore
npm ci
cargo build --workspace
```

Or: `make setup`

### Dev Container
Open in VS Code with Dev Containers extension for one-click setup.

## Contribution Checklist

Before submitting a PR, run the full verification suite:

```bash
# 1. Format Rust code
cargo fmt --all

# 2. Lint Rust code (must pass with zero warnings)
cargo clippy --workspace --all-targets -- -D warnings

# 3. Run Rust tests
cargo test --workspace

# 4. Verify benchmarks compile
cargo bench -p sawyer-core --bench microbench --no-run

# 5. TypeScript checks
npm run typecheck
npm run lint
npm test
```

Or use the cross-platform shortcut:
```bash
npm run verify:rust
```

## Project Doctrine

These principles are non-negotiable:

1. **Keep deterministic behavior as the default.** No random fallbacks, no non-reproducible state.
2. **Never claim model, SIMD, or GPU support when unavailable.** If hardware isn't detected, report truthfully.
3. **Preserve truthful degraded states.** A 503 with context is better than a 200 with lies.
4. **Benchmark before making performance claims.** No optimistic estimates.
5. **Localhost-first networking defaults.** External connections require explicit opt-in.
6. **Explicit errors over silent fallback.** Fail loud, fail clear.
7. **No secrets in repository.** Use `.env.example` only.

## Code Structure

| Layer | Path | Language |
|---|---|---|
| Core runtime | `crates/sawyer-core` | Rust |
| CLI | `crates/sawyer-cli` | Rust |
| HTTP server | `crates/sawyer-server` | Rust |
| SaaS (billing, tenancy, growth) | `src/` | TypeScript |
| Tests | `tests/` | TypeScript |
| Scripts | `scripts/` | TypeScript + Bash |
| SDK | `sdk/` | TypeScript |

## Environment Variables

All environment variables use the `SAWYER_` prefix. See `.env.example` for the canonical list.

## Branch Conventions

- `main` — stable, all CI passes
- Feature branches — `feature/<name>`
- Fix branches — `fix/<name>`

## Questions?

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues, or open a discussion.
