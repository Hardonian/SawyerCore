# SawyerCore Python SDK

The official Python client library for [SawyerCore](https://github.com/example/SawyerCore).

## Installation

```bash
pip install -e sdk/python
```

Or install in your Python environment:
```bash
pip install sawyercore
```

## Quickstart

```python
from sawyercore import SawyerClient

# Initialize client with your API key
client = SawyerClient(
    api_key="your_api_key_here",
    endpoint="http://127.0.0.1:8787"
)

# Check health
health = client.health()
print("Sawyer health:", health)

# Execute an AI task
result = client.prompt("Explain quantum computing in one sentence")
print(f"Output: {result.output}")
print(f"Provider: {result.provider}")
print(f"Latency: {result.latency_ms}ms")
print(f"Cost: ${result.cost_usd}")
```

## Truthful Degraded State Handling

```python
from sawyercore import SawyerClient, ServiceDegradedError, QuotaExceededError

client = SawyerClient(api_key="your_api_key_here")

try:
    result = client.run_task(
        task_type="chat",
        input_text="Classify this incident report...",
        privacy="sensitive"
    )
except ServiceDegradedError as e:
    print(f"Engine operating in degraded mode: {e.degraded_state}")
    print(f"Message: {e.message}")
except QuotaExceededError as e:
    print(f"Tenant quota reached: {e.message}")
```
