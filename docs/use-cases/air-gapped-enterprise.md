# Air-Gapped Enterprise Deployment Guide

Guidelines for running SawyerCore in zero-trust, air-gapped, or regulated environments (finance, healthcare, defense).

---

## Zero-Egress Architecture

SawyerCore guarantees zero unauthorized outbound connections when configured in `local-safe` mode:

```ini
SAWYER_MODE=local-safe
SAWYER_PRIVATE_MODE=true
SAWYER_CLOUD_FALLBACK=false
SAWYER_ENABLE_TELEMETRY=false
```

### Key Protections:
1. **Local-First Model Serving**: All embeddings, classifications, and token generation run on internal endpoints (e.g. `127.0.0.1:8000` or on-prem cluster).
2. **Fail-Closed Routing**: Any task requiring an unavailable cloud model fails with an explicit `503 Service Unavailable` or `403 Forbidden` error rather than attempting external internet egress.
3. **Local State Persistence**: Audit trails, Knowledge Packs, and execution graphs are persisted locally to filesystem / SQLite without external cloud database dependencies.
4. **Reproducible Builds**: Release binaries can be verified deterministically against official source code using `make build-repro`.
