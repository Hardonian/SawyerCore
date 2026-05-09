# Micro Index

SawyerCore maintains an optional in-process micro index:

- Structure: `keyword -> list of KB keys`
- Build time: on KB writes
- Purpose: improve fuzzy recall without vector search

Properties:
- deterministic
- local-only
- no external services
- no async workers
