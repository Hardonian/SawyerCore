# Operator Truth

## System Mission

SawyerCore is a **deterministic edge AI runtime + governance engine** that:
- Executes tasks on local or remote providers with cost-aware routing
- Enforces tenant isolation and policy compliance
- Preserves truthful degraded states (never hides failures)
- Operates locally-first, escalating to remote only when necessary
- Maintains full audit trail of all decisions

## Hard Invariants

These must NEVER be violated. Detection triggers immediate triage and release block.

### Invariant Set

| # | Invariant | Description | Verification |
|---|-----------|-------------|--------------|
| INV-1 | Deterministic routing | Same input → same provider selection | `verify:determinism` |
| INV-2 | No silent cost escalation | Budget exceeded → explicit degraded mode | Cost-aware tests |
| INV-3 | Tenant isolation | Cross-tenant data access impossible | Policy engine checks |
| INV-4 | Billing precision | No rounding errors in cost totals | Billing unit tests |
| INV-5 | Degraded truthfulness | Error responses show real reason, not generic | Error response tests |
| INV-6 | No unhandled exceptions | All top-level async/await has try/catch | Lint rule + tests |
| INV-7 | Local-first escalation | Remote only invoked when local impossible | Provider health checks |
| INV-8 | Immutable audit log | All decisions written before response | Audit log tests |
| INV-9 | Zero tolerated secrets | No hardcoded credentials anywhere | Sentinel secret check |
| INV-10 | Reproducible builds | Cargo + TSC output identical per commit | Build artifact hash |

### Invariant Violation Response

- **S1 (Critical):** Immediate rollback + incident
- **S2 (High):** Hotfix within 24h
- **S3 (Medium):** Next sprint
- **S4 (Low):** Tech debt backlog

## Degraded States

Degraded operation is expected and must be **graceful and truthful**.

### Supported Degraded Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| `no_providers` | All providers unhealthy | Return 503 with retry-after suggestion |
| `budget_exhausted` | Task spend limit reached | Deny with remaining budget info |
| `memory_pressure` | System RAM < 200MB | Queue or defer non-critical tasks |
| `thermal_throttle` | Device temperature high | Slow down heavy local models |
| `network_down` | Remote provider unreachable | Immediately fallback to local |
| `rate_limit` | API quota exceeded | Backoff + switch providers |

Degraded state responses MUST include:
- `degraded: true` flag in response
- `reason: explicit human-readable cause`
- `recovery: suggested action or retry hint`

## Critical Paths

Critical paths are code paths that:
- Handle billing
- Enforce security/policy
- Route tasks to providers
- Load/initialize core runtime

### Marking Critical Code

Use `@critical` JSDoc tag for TypeScript and `#[critical]` for Rust:

```ts
/** @critical */
export async function runInference(task: AiTask): Promise<InferenceResult> {
  // …
}
```

Critical paths are subjected to:
- Extra test coverage (90%+)
- No optional chaining `?.` or nullish coalescing `??` without explicit fallback
- Explicit error types (no generic `Error`)

## Anti-patterns

| Pattern | Why it's wrong | Correct approach |
|---------|----------------|------------------|
| `throw new Error('unimplemented')` | Runtime crash in production | Return proper `NotImplemented` error with details |
| `process.exit()` | Kills Node process | Return error code or emit event |
| `try { … } catch {}` empty | Swallows errors silently | Always log + rethrow or handle |
| `// TODO` in critical file | Known incomplete code | File issue, block with `if (false)` |
| Hardcoded secrets | Leaks credentials | Use env vars, validate on startup |
| Global mutable state | Race conditions | Use dependency injection |
| Implicit fallback | Silent path change | Log every fallback with reason |
| Suppressed lint | Hides problems | Fix violations, don't disable |

## Agent Execution Rules

When autonomous agents operate on this repository:

1. **No-theatre principle:** Every claim must have evidence. If reporting "tests pass", include actual test output.
2. **No broad rewrites:** Only touch files directly related to the task. Use surgical edits.
3. **No deleting unrelated work:** Never remove unrelated files, even if they seem unused.
4. **No hiding failures:** Test commands that always succeed are theatre. Let real failures surface.
5. **No fake green checks:** If a command fails in CI, reproduce locally first to understand.
6. **No route-local truth:** All decisions flow through `src/runtime/router.ts`. No ad-hoc routing.
7. **No silent logistics:** If a dependency fails to install, surface the error, don't fallback to npm.
8. **Respect AGENTS.md:** Follow the project doctrine in every action.

## Change Verification Commands

Before merging any PR, run:

```bash
# Quick pre-flight
npm run typecheck && npm run lint

# Full gate
npm run verify:release

# Verify CI health (tools available)
npm run verify:ci-health

# Verify repo state (clean working tree)
npm run verify:repo-state

# Run targeted integration tests
npm run verify:ai && npm run verify:policy && npm run verify:runtime
```

## Rollback Truth

If a release fails:
1. Immediate rollback to previous tag
2. Post-mortem using failure taxonomy codes
3. Add detection test to prevent recurrence
4. Update this document if process gap found

---

*This document is the source of truth for operators. All actions must conform.*
