# SawyerCore REST API Reference

Comprehensive endpoint reference with cURL examples, request/response headers, schemas, and usage notes.

---

## Authentication

All multi-tenant and management API endpoints require an API key passed via the `x-api-key` header:

```bash
-H "x-api-key: your_api_key_here"
```

To create your first tenant and API key, see the [Operator Runbook](../../RUNBOOK.md) or run:
```bash
npm run sawyer:init
```

---

## Endpoints

### 1. Health Check
Unauthenticated ping to check service responsiveness.

- **URL**: `/api/health`
- **Method**: `GET`
- **Authentication**: None

```bash
curl http://127.0.0.1:8787/api/health
```

**Response (200 OK)**:
```json
{
  "status": "ok",
  "timestamp": "2026-08-23T02:00:00.000Z"
}
```

---

### 2. Engine Runtime Status
Inspect active profile, hardware capabilities, and provider status.

- **URL**: `/api/status`
- **Method**: `GET`
- **Authentication**: Required

```bash
curl http://127.0.0.1:8787/api/status \
  -H "x-api-key: $SAWYER_API_KEY"
```

**Response (200 OK)**:
```json
{
  "status": "healthy",
  "activeProfile": "local-safe",
  "hardware": {
    "cpuCores": 24,
    "availableMemory": 10782773248,
    "gpuAvailable": false
  },
  "providers": [
    {
      "name": "vLLM",
      "tier": "LOCAL_BALANCED",
      "modelId": "Qwen/Qwen2.5-3B-Instruct",
      "contextWindow": 8192,
      "costPer1kTokens": 0.0,
      "available": true,
      "latencyMs": 18.4
    }
  ]
}
```

---

### 3. Execute AI Task
Submit an AI task (chat, embedding, classification, summarization) with privacy constraints and quota validation.

- **URL**: `/api/tasks`
- **Method**: `POST`
- **Authentication**: Required

```bash
curl -X POST http://127.0.0.1:8787/api/tasks \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SAWYER_API_KEY" \
  -d '{
    "type": "chat",
    "input": "Summarize latest deployment incident",
    "privacy": "sensitive"
  }'
```

**Response (200 OK)**:
```json
{
  "id": "task_9f8a3b2c",
  "tenantId": "tenant_1",
  "runId": "run_01j7x",
  "output": "Incident resolved: memory pressure relieved by local quantization fallback.",
  "provider": "vLLM",
  "latencyMs": 142.5,
  "costUsd": 0.0,
  "tokensUsed": 64,
  "degradedState": "NOMINAL",
  "timestamp": "2026-08-23T02:05:00.000Z"
}
```

---

### 4. Tenant Profile & Billing
Check current resource usage, active plan limits, and real-time billing metrics.

- **URL**: `/api/me`
- **Method**: `GET`
- **Authentication**: Required

```bash
curl http://127.0.0.1:8787/api/me \
  -H "x-api-key: $SAWYER_API_KEY"
```

**Response (200 OK)**:
```json
{
  "tenant": {
    "id": "tenant_1",
    "name": "Acme Corp",
    "email": "dev@acme.com",
    "status": "active",
    "plan": "pro",
    "resourceLimits": {
      "maxConcurrentTasks": 10,
      "maxStorageBytes": 10737418240,
      "maxApiCallsPerMinute": 120,
      "maxAgents": 5
    }
  },
  "quota": {
    "canExecute": true
  },
  "billing": {
    "tenantId": "tenant_1",
    "periodStart": "2026-08-01T00:00:00.000Z",
    "periodEnd": "2026-08-31T23:59:59.000Z",
    "baseAmountUsd": 49.00,
    "usageAmountUsd": 4.12,
    "totalAmountUsd": 53.12,
    "lineItems": [
      { "description": "Pro Base Subscription", "quantity": 1, "unitPriceUsd": 49.00, "totalUsd": 49.00 },
      { "description": "API Task Executions", "quantity": 412, "unitPriceUsd": 0.01, "totalUsd": 4.12 }
    ]
  }
}
```

---

### 5. OpenAI-Compatible Route
Standard OpenAI `/v1/chat/completions` endpoint for plug-and-play SDK compatibility.

- **URL**: `/v1/chat/completions`
- **Method**: `POST`

```bash
curl -X POST http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local-qwen",
    "messages": [
      { "role": "system", "content": "You are a concise edge assistant." },
      { "role": "user", "content": "What is the capital of France?" }
    ],
    "temperature": 0.2
  }'
```

---

### 6. Explain Last Routing Decision
Inspect why the policy engine made the last routing choice.

- **URL**: `/explain/last`
- **Method**: `GET`

```bash
curl http://127.0.0.1:8787/explain/last
```
