# Minimal Build Guide

SawyerCore is local-first by default.

## Build smallest runtime primitives

```bash
cargo build --release -p sawyer-core --no-default-features
```

## Build CLI + server runtime

```bash
cargo build --release -p sawyer-cli --features cli,server
```

## Security defaults

- Binds localhost by default (`127.0.0.1`).
- Private mode enabled by default.
- Cloud disabled by default.
- LAN disabled by default.
- Audit logs enabled and redacted by default.
- Invalid security config fails closed unless `--unsafe-dev` is explicitly passed.
