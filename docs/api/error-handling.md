# Error Handling & Truthful Degraded States

SawyerCore follows an explicit **truth in engineering doctrine**:
1. **No silent fallbacks** to unverified cloud services or imaginary models.
2. **Explicit degraded states** reported in status codes and structured payloads.
3. **Fail-closed privacy**: sensitive prompts are rejected with HTTP 403 rather than accidentally leaked to external providers.

---

## Status Code Catalog

| HTTP Code | Name | Cause | Resolution |
|---|---|---|---|
| `200` | OK | Task completed nominal or under managed degraded constraints. | None. |
| `400` | Bad Request | Request payload failed schema validation (e.g., missing `type` or invalid `privacy`). | Review payload against [`openapi.yaml`](openapi.yaml) or SDK types. |
| `401` | Unauthorized | Missing or invalid `x-api-key` header. | Provide a valid tenant API key. |
| `403` | Forbidden / Privacy Block | Privacy policy blocked routing (e.g., prompt contains PII/secrets with cloud fallback disabled). | Route to a local provider or enable local privacy model. |
| `404` | Not Found | Target endpoint or resource ID not found. | Check URL path. |
| `429` | Quota Exceeded | Tenant has exceeded concurrent tasks, monthly allowance, or rate limit. | Upgrade plan or wait for quota reset. |
| `503` | Service Unavailable / Degraded | Requested local provider (e.g., vLLM, llama-server) is offline. | Start local provider (`./scripts/start-local-stack.sh`) or check logs. |

---

## Degraded States Structure

When a task executes under degraded conditions (e.g., memory pressure, provider outage), the response payload explicitly includes `degradedState`:

```json
{
  "id": "task_123",
  "degradedState": "MODEL_UNAVAILABLE",
  "error": "Local provider llama-server unreachable at http://127.0.0.1:8080/v1",
  "fix": "Start local model server: ./scripts/start-llamacpp.sh"
}
```

### Degraded State Types:
- `NOMINAL`: Full hardware and provider support available.
- `MODEL_UNAVAILABLE`: Configured backend is down; engine reported truth rather than mock output.
- `LOW_MEMORY`: Engine compressed context or switched to smaller quantized model.
- `PARTIAL_EXECUTION`: Task graph partially resolved with graceful fallback.

---

## SDK Error Handling Patterns

### TypeScript:
```typescript
import { SawyerClient, ServiceDegradedError, QuotaExceededError } from 'sawyercore';

const client = new SawyerClient({ apiKey: process.env.SAWYER_API_KEY! });

try {
  const result = await client.tasks.run({
    type: 'chat',
    input: 'Analyze telemetry stream'
  });
} catch (error) {
  if (error instanceof ServiceDegradedError) {
    console.warn(`Engine degraded state: ${error.degradedState}`);
  } else if (error instanceof QuotaExceededError) {
    console.error(`Tenant quota exceeded: ${error.message}`);
  } else {
    console.error(`Request failed: ${error.message}`);
  }
}
```

### Python:
```python
from sawyercore import SawyerClient, ServiceDegradedError, QuotaExceededError

client = SawyerClient(api_key="your_api_key")

try:
    result = client.run_task("chat", "Analyze telemetry stream")
except ServiceDegradedError as e:
    print(f"Service degraded: {e.degraded_state}")
except QuotaExceededError as e:
    print(f"Quota exceeded: {e.message}")
```
