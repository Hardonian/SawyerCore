# Verification

Run from repository root:

```bash
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo build --workspace
npm run lint
npm run verify:ai
npm run verify:policy
npm run verify:runtime
npm run verify:config
npm run verify:recommendations
```

If npm is unavailable, use the Rust-only fallback:

```bash
./scripts/verify-rust-only.sh
```

## CI posture
- CI uses deterministic tests with mocked providers.
- CI does not require live vLLM/LiteLLM endpoints.
- Live provider validation is optional and performed locally via `npm run sawyer:doctor`.
