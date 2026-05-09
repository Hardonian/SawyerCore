# Release Sentinel Report

✗ **Status: BLOCKED**
Generated: 2026-04-29T02:16:46.813Z
Commit: 8b3ddab

## Summary

- Overall: FAILED
- Required checks passed: 4 / 6

## Check Details

| Check | Status | Message |
|-------|--------|---------|
| TypeScript typecheck | ✅ PASS | No type errors found |
| ESLint | ✅ PASS | No lint violations |
| Test suite | ❌ FAIL | some test(s) failed |
| Build (Rust + TS) | ❌ FAIL | Build failures detected |
| Forbidden TODO/FIXME | ✅ PASS | No forbidden markers in critical paths |
| Secret leakage | ❌ FAIL | Potential secret(s) found in source code: 6 occurrence(s) |
| Committed env files | ❌ FAIL | 1 environment file(s) accidentally committed |
| Hard-crash patterns | ❌ FAIL | Potential hard-crash pattern(s) detected: 1 |
| Unhandled degraded states | ✅ PASS | No empty catch-then-throw anti-patterns found |

## Blockers

- ❌ Test suite
- ❌ Build (Rust + TS)

## Evidence

### Test suite
```
> sawyercore@0.1.0 test
> vitest run


[1m[46m RUN [49m[22m [36mv3.2.4 [39m[90mC:/Users/scott/GitHub/SawyerCore[39m

 [32m✓[39m tests/runtime/preload-planner.test.ts [2m([22m[2m1 test[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/runtime/providers.test.ts [2m([22m[2m2 tests[22m[2m)[22m[32m 4[2mms[22m[39m
 [32m✓[39m tests/saas/growth.test.ts [2m([22m[2m14 tests[22m[2m)[22m[32m 15[2mms[22m[39m
 [32m✓[39m tests/saas/tenant-isolation.test.ts [2m([22m
```

### Build (Rust + TS)
```
'cargo' is not recognized as an internal or external command,
operable program or batch file.

```

### Secret leakage
```
src\cli\sawyer-init.ts: ['VLLM_BASE_URL=http://localhost:8000/v1', 'LITELLM_BASE_URL=http://localhost:4000/v1', 'LLAMACPP_BA
crates\sawyer-server\src\lib.rs: .body(Body::from(chat_req("local", "token=abc api_key=xyz")))
crates\sawyer-server\src\lib.rs: api_key: "sk_test123".to_string(),
crates\sawyer-server\src\lib.rs: api_key: "sk_tenant_a".to_string(),
crates\sawyer-server\src\lib.rs: api_key: "sk_tenant_b".to_string(),
```

### Committed env files
```
.env.sawyer.example
```

### Hard-crash patterns
```
src\cli\sawyer-doctor.ts: process.exit() in server code will terminate entire process
```

---
*This report is deterministic. Manual override requires explicit review and signed approval.*
