# Dependency Budget (v1.3)

## Policy

- Keep `sawyer-core`, `sawyer-scheduler`, `sawyer-memory`, `sawyer-kernels`, and `sawyer-sim` CPU-first and minimal.
- Keep HTTP stack isolated to `sawyer-server`.
- Keep terminal UX dependencies isolated to `sawyer-cli`.
- Do not require Node/npm for runtime execution.

## How to audit

```bash
cargo tree -p sawyer-core
cargo tree -p sawyer-server
cargo tree -p sawyer-cli --features cli,server
```

## Optional binary sizing tools

`cargo-bloat` is optional for local profiling:

```bash
cargo install cargo-bloat
cargo bloat -p sawyer-cli --release --crates
```

Use it to justify changes before making performance or footprint claims.
