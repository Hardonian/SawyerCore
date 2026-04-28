# SawyerCore Quickstart

## One command

```bash
cargo run -p sawyer-cli -- quickstart
```

## Start runtime

```bash
cargo run -p sawyer-cli -- up
```

## Next checks

```bash
cargo run -p sawyer-cli -- mode current
cargo run -p sawyer-cli -- compare
curl http://127.0.0.1:8080/status
curl http://127.0.0.1:8080/explain/last
```

If no local provider is available, SawyerCore reports degraded local status and fix steps instead of fake success.
