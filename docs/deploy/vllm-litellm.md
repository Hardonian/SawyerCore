# vLLM + LiteLLM Deployment

- vLLM OpenAI-compatible endpoint: `http://localhost:8000/v1`
- LiteLLM proxy endpoint: `http://localhost:4000`
- Preferred chain: mobile/local tiny -> vLLM -> LiteLLM -> cloud (policy permitting)
- Configure timeout/retry in `sawyer.config.json` provider blocks.
