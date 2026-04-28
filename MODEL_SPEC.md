# MODEL_SPEC

SawyerCore currently defines a truthful local model adapter contract without claiming inference availability.

## Adapter contract

- Input: chat requests with `model` and `messages`
- Output: chat completion response object or explicit unavailable error
- Degraded behavior: `503 Service Unavailable` with structured error payload when adapter/model unavailable

## Planned backend support

- GGUF and llama.cpp-style local backend implementations
- deterministic token budgeting and runtime visibility hooks

Until a backend is implemented and detected at runtime, model availability remains false.
