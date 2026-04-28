# AGENTS

## Project doctrine

- Keep deterministic behavior as the default.
- Never claim model, SIMD, or GPU support when unavailable.
- Preserve truthful degraded states in CLI and HTTP responses.
- Benchmark before making performance claims.

## Contribution checklist

1. `cargo fmt --all`
2. `cargo clippy --workspace --all-targets -- -D warnings`
3. `cargo test --workspace`
4. `cargo bench -p sawyer-core --bench microbench --no-run`

## Release posture

- Localhost-first networking defaults.
- Explicit errors over silent fallback.
- No secrets in repository; use `.env.example` only.
