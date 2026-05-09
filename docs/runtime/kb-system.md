# KB Variable System

SawyerCore now uses a deterministic JSON-backed key-value memory (`sawyer-kb`) as the default memory layer.

- No embeddings.
- No vector database.
- No background workers.
- Append-only JSONL persistence (`.sawyer/kb.jsonl`).

`KBStore` supports:
- `set(key, value, scope, confidence)` with overwrite rules (newer timestamp or higher confidence).
- `get(key)` exact lookup.
- `fuzzy_get(query)` token-overlap scoring plus deterministic tiebreakers.

A lightweight inverted index (`token -> kb keys`) is built during writes to improve recall while staying local-first and deterministic.
