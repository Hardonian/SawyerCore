# Verification

Run from repository root:

```bash
make fmt
make lint
make test
make build
make bench
make verify
```

Smoke test server:

```bash
cargo run -p sawyer-cli -- serve --bind 127.0.0.1:8080
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:8080/status
```

Smoke test simulation endpoint:

```bash
curl -s -X POST http://127.0.0.1:8080/sim/run \
  -H 'content-type: application/json' \
  -d '{"seed":1,"events":[{"tick":1,"agent_id":1,"payload":"hi"}]}'
```
