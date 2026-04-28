# vLLM + LiteLLM Deployment

## IMPLEMENTED
- vLLM OpenAI-compatible probing: `GET /v1/models`.
- LiteLLM OpenAI-compatible probing: `GET /v1/models`.
- Chat transport scaffolding: `POST /v1/chat/completions`.
- Timeout + retry budget controlled by each provider config block.
- Structured degraded behavior when endpoints are unavailable.

## CONFIG-DEPENDENT
- `providers.vllm.endpoint` and `providers.litellm.endpoint` in `sawyer.config.json`.
- `providers.*.enabled` toggles.
- Policy fallback permissions and tenant cloud egress constraints.

## STUBBED
- Provider-specific auth headers and advanced model parameter negotiation.

## FUTURE
- Live-provider deployment profile templates for Kubernetes/systemd.
