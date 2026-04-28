# Concepts

- **Runtime**: deterministic execution loop and CLI/server orchestration.
- **Provider**: local inference endpoint (llama.cpp, vLLM, LiteLLM proxy).
- **Policy**: local-safe defaults and explicit no-cloud-by-default enforcement.
- **Router**: chooses provider by mode + availability with no hidden fallback.
- **Degraded state**: explicit status when no provider/model is available.
- **Audit log**: `sawyer explain last` and `/explain/last` expose reasons for selection/rejection.
- **Local-safe mode**: default posture that blocks cloud fallback unless explicitly enabled.
