# Release Sentinel Report

✗ **Status: BLOCKED**
Generated: 2026-08-23T02:25:35.533Z
Commit: 198f0be

## Summary

- Overall: FAILED
- Required checks passed: 6 / 7

## Check Details

| Check | Status | Message |
|-------|--------|---------|
| TypeScript typecheck | ✅ PASS | No type errors found |
| ESLint | ✅ PASS | No lint violations |
| Test suite | ✅ PASS | All tests passed |
| Build (Rust + TS) | ❌ FAIL | Build failures detected |
| Forbidden TODO/FIXME | ✅ PASS | No forbidden markers in critical paths |
| Secret leakage | ❌ FAIL | Potential secret(s) found in source code: 6 occurrence(s) |
| Committed env files | ✅ PASS | No .env files in git history |
| Hard-crash patterns | ❌ FAIL | Potential hard-crash pattern(s) detected: 1 |
| Unhandled degraded states | ✅ PASS | No empty catch-then-throw anti-patterns found |

## Blockers

- ❌ Build (Rust + TS)

## Evidence

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

### Hard-crash patterns
```
src\cli\sawyer-doctor.ts: process.exit() in server code will terminate entire process
```

---
*This report is deterministic. Manual override requires explicit review and signed approval.*
