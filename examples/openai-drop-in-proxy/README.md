# OpenAI Drop-in Proxy Example

SawyerCore exposes an OpenAI-compatible `/v1/chat/completions` endpoint on port `8787` by default.
You can redirect standard OpenAI clients, LangChain, or LiteLLM to SawyerCore with zero application code rewrites.

---

## 1. Node.js (OpenAI SDK)

```typescript
import OpenAI from 'openai';

// Point standard OpenAI SDK at local SawyerCore instance
const openai = new OpenAI({
  baseURL: 'http://127.0.0.1:8787/v1',
  apiKey: process.env.SAWYER_API_KEY || 'sawyer-local',
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: 'local-qwen',
    messages: [
      { role: 'system', content: 'You are an edge AI assistant.' },
      { role: 'user', content: 'Summarize our edge safety protocol.' },
    ],
  });

  console.log('Response:', completion.choices[0].message.content);
}

main();
```

---

## 2. Python (OpenAI Library)

```python
from openai import OpenAI

# Point client at SawyerCore
client = OpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key="sawyer-local",
)

response = client.chat.completions.create(
    model="local-qwen",
    messages=[
        {"role": "user", "content": "Explain deterministic runtime scheduling."}
    ],
)

print("Response:", response.choices[0].message.content)
```

---

## 3. Privacy & Fail-Closed Behavior

If a user prompt contains sensitive PII or credentials, SawyerCore's policy engine inspects the prompt before routing.
- When `SAWYER_PRIVATE_MODE=true` and cloud fallback is disabled, requests to cloud models with private data return **HTTP 403 Forbidden** rather than leaking data to external APIs.
- Local models process private data on-device without network egress.
