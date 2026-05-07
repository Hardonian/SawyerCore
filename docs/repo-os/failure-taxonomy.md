# Failure Taxonomy

SawyerCore failures are classified by impact domain and recoverability strategy.

## Classification Schema

```
<Domain>.<Subsystem>.<Severity>.<Mode>
```

**Domains:**
- `CI` — Continuous Integration failures
- `DEPLOY` — Release/deployment failures
- `RUNTIME` — Production runtime failures
- `SECURITY` — Security/secret failures
- `DATA` — Data integrity or billing errors
- `PERF` — Performance/regression failures
- `CONFIG` — Configuration/state failures

**Severity:**
- `S1` — System down (all users affected)
- `S2` — Degraded (some users affected)
- `S3` — Warning (non-critical)
- `S4` — Informational

**Mode:**
- `HARD` — Unrecoverable without manual intervention
- `SOFT` — Auto-recovered via degraded mode
- `NOISE` — False positive or expected in specific states

---

## Taxonomy Table

### CI.NO_TOKEN fail taxonomy

| Code | Name | Cause | Mitigation | Auto-fixable? |
|------|------|-------|------------|---------------|
| CI.BUILD.S1.HARD | Build pipeline cannot compile | Rust or TS syntax error, missing dependency | Fix code + deps, rerun CI | ❌ No |
| CI.TEST.S2.HARD | Test suite regression | Logic change broke assertion | Fix code, update test if change intentional | ⚠️ Conditional |
| CI.LINT.S3.SOFT | Style violation | ESLint rule broken | Auto-fix with `eslint --fix` | ✅ Yes |
| CI.ENV.S1.HARD | Toolchain missing | Node/Rust not installed or wrong version | Install correct toolchain | ✅ Yes (script) |
| CI.DEPS.S2.HARD | Dependency resolution failed | npm/cargo conflicts, checksum mismatch | Clean + reinstall | ✅ Sometimes |
| CI.SECRET.S1.HARD | Secret detected in CI log | Hardcoded credential leaked | Remove secret, rotate if exposed | ❌ No |

### RUNTIME.taxonomy

| Code | Name | Cause | Mitigation | Auto-fixable? |
|------|------|-------|------------|---------------|
| RUNTIME.PROVIDER_DOWN.S2.SOFT | Provider unavailable | Model server crashed/network | Fallback to healthy provider | ✅ Yes |
| RUNTIME.BUDGET_EXCEEDED.S2.SOFT | Task budget exhausted | Too many expensive calls | Route to cheap provider, degrade | ✅ Yes |
| RUNTIME.MEMORY_SOFT.S2.SOFT | Memory pressure | Large context or leak | Throttle, unload, compress | ✅ Yes |
| RUNTIME.MEMORY_HARD.S1.HARD | Out-of-memory crash | Unbounded allocation | Task killed, process may crash | ❌ No |
| RUNTIME.POLICY_DENY.S3.SOFT | Policy blocked execution | Tenant/policy rule violation | Graceful rejection with reason | ✅ Yes |
| RUNTIME.ROUTE_CRASH.S1.HARD | Router threw exception | Unhandled error in SawyerRouter | 500 response, error logged | ❌ No (needs fix) |
| RUNTIME.DEGRADED_LOOP.S2.HARD | Degraded state loop | Fallback chain exhausted | Deny with recoverable error | ❌ No |

### SECURITY taxonomy

| Code | Name | Cause | Mitigation | Auto-fixable? |
|------|------|-------|------------|---------------|
| SECURITY.SECRET_LEAK.S1.HARD | Hardcoded secret detected | API key in source code | Rotate secret, remove from git history | ❌ No |
| SECURITY.ENV_FILE.S1.HARD | .env committed to repo | Sensitive config in-tracked file | Remove from git, add to .gitignore | ⚠️ Requires cleanup |
| SECURITY.RBAC_BYPASS.S1.HARD | Policy engine bypass | Tenant isolation failure | Immediate hotfix + audit | ❌ No |

### DATA taxonomy

| Code | Name | Cause | Mitigation | Auto-fixable? |
|------|------|-------|------------|---------------|
| DATA.BILLING_LOSS.S1.HARD | Usage record lost | Stripe webhook failed silently | Replay from audit log | ⚠️ Requires manual |
| DATA.ROUNDING_ERROR.S2.SOFT | Cost rounding drift | Float math in billing | Use integer cents (fixed) | ❌ (tracks issue) |

### PERF taxonomy

| Code | Name | Cause | Mitigation | Auto-fixable? |
|------|------|-------|------------|---------------|
| PERF.COLD_START_REGRESS.S2.SOFT | Startup slowed | Added heavy eager imports | Lazy-load non-critical | ✅ Yes (refactor) |
| PERF.MEMORY_LEAK.S1.HARD | Memory grows unbounded | Leaked references | Fix code, release patch | ❌ No |

---

## Mapping to Repair Strategies

When a failure is detected:

1. **Classify** using `scripts/ci/classify-failure.ts`
2. **Lookup** appropriate repair strategy from this taxonomy
3. **Generate** deterministic plan via `scripts/ci/repair-plan.ts`
4. **Execute** manual fix based on plan (non-auto-edit by default)

## Degraded State Truth Table

Task budget exhausted | Provider down | Memory low | Action
---------------------|---------------|------------|--------
No | No | No | Normal routing
Yes | No | No | Route to cheap provider
Yes | Yes | No | Safe deny + reason
No | Yes | No | Try next-healthiest provider
No | No | Yes | Lazy-load, defer non-critical
Any | Any | Yes (critical) | Deny + retry later

## Anti-patterns

- ❌ **Silent fallback** — always log degraded path choice
- ❌ **Implicit budget escalation** — always check `budgetTracker.canProceed()`
- ❌ **Route-local truth drift** — all routing decisions centralized in router
- ❌ **Theatre CI** — no fake green checks; fail fast, show evidence
