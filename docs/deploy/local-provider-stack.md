# Local Provider Stack (vLLM + LiteLLM + llama.cpp + SawyerCore)

This guide brings up a **localhost-only** provider chain for production smoke testing with explicit degraded behavior.

## Ports and endpoints

- vLLM: `127.0.0.1:8000` (`/v1/models`, `/v1/chat/completions`)
- LiteLLM: `127.0.0.1:4000` (`/v1/models`, `/v1/chat/completions`)
- llama.cpp: `127.0.0.1:8080` (`/health`, optional `/v1/*` depending on build)
- SawyerCore server: `127.0.0.1:8787` (`/health`, `/status`, `/v1/chat/completions`)

## Required environment

Copy and edit local env:

```bash
cp .env.local.example .env.local
```

Mandatory vars:

- `SAWYER_BIND_HOST` (default `127.0.0.1`)
- `SAWYER_PORT` (default `8787`)
- `SAWYER_PRIVATE_MODE=true`
- `SAWYER_CLOUD_FALLBACK=false`

Optional llama.cpp vars:

- `SAWYER_LLAMACPP_ENABLED=true`
- `SAWYER_LLAMACPP_MODEL_PATH=/absolute/path/to/model.gguf`

## Run order

```bash
make local-vllm
make local-litellm
make local-stack
make smoke-local
```

`make local-stack` writes `config/providers/local-stack.resolved.json` with reachable providers enabled and unreachable providers explicitly disabled.

## Safety defaults

- Localhost bind only.
- No cloud keys required.
- No cloud providers enabled by default.
- No hidden fallback if a provider is down.
- Failures include exact command-level fix hints.

## Windows PowerShell notes

Bash scripts are not directly executable in PowerShell.

Equivalent flow (PowerShell + WSL recommended):

1. Start WSL and run the `make` targets above.
2. Or invoke scripts with Git Bash: `bash scripts/start-vllm.sh`, etc.
3. For native PowerShell wrappers, mirror each script command and keep the same localhost-only bindings and fail-closed checks.
