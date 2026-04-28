# Runtime modes

## tiny
- CPU-only footprint.
- vLLM and LiteLLM disabled.
- Local HTTP (llama.cpp compatible) only.

## local
- Local-first safe default.
- Optional vLLM/LiteLLM availability checks.
- Cloud disabled.

## performance
- vLLM preferred when available.
- Higher memory budget and preloading posture.

## gateway
- LiteLLM proxy path enabled.
- Local routes first, cloud still disabled by default.

## dev
- Verbose diagnostics.
- Intended for development only.

Commands:

```bash
cargo run -p sawyer-cli -- mode list
cargo run -p sawyer-cli -- mode explain tiny
cargo run -p sawyer-cli -- mode set local
cargo run -p sawyer-cli -- mode current
```
