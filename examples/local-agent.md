# Local Agent API Example

Start server:

```bash
cargo run -p sawyer-cli -- serve --bind 127.0.0.1:8080
```

Request degraded local chat completion:

```bash
curl -s -X POST http://127.0.0.1:8080/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"local-placeholder","messages":[{"role":"user","content":"hello"}]}'
```

The response should indicate model unavailability with truthful degraded state.
