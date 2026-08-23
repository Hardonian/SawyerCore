# Docker Compose Deployment Guide

This guide walks through deploying a fully containerized, local-first stack with SawyerCore, vLLM, and LiteLLM.

## Quick Start

```bash
docker compose up -d
```

## Verifying the Stack

```bash
# 1. Check container health
docker compose ps

# 2. Test SawyerCore health
curl http://localhost:8787/api/health

# 3. Test vLLM health directly
curl http://localhost:8000/health

# 4. Check available providers in SawyerCore
curl http://localhost:8787/api/providers -H "x-api-key: $SAWYER_API_KEY"
```

## Volume Persistence
- `sawyer-data`: Holds tenant metadata, SQLite state, and knowledge packs.
- `sawyer-logs`: Contains audit logs and request telemetry.
- `huggingface-cache`: Caches downloaded model weights so containers restart instantly.
