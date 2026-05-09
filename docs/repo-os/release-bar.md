# Release Bar

## Definition of Done

A **release** of SawyerCore is considered ready for deployment to production when ALL of the following conditions are met:

### 1. Code Quality Gates (automated)

| Check | Command | Status |
|-------|---------|--------|
| TypeScript typecheck | `npm run typecheck` | ✅ Zero errors |
| ESLint | `npm run lint` | ✅ Zero violations |
| Unit/Integration tests | `npm test` | ✅ 100% passing |
| Rust build | `cargo build --workspace` | ✅ Builds clean |
| Rust clippy | `cargo clippy --workspace` | ✅ Zero warnings |
| Release sentinel | `npm run verify:release` | ✅ CLEARED |
| Repo state | `npm run verify:repo-state` | ✅ Clean or explicitly allowed |

### 2. Safety Gates (automated)

- ❌ No secrets leaked in source or staged changes
- ❌ No `.env` files committed (except `.env.example`)
- ❌ No forbidden `TODO/FIXME/HACK` markers in critical paths (`src/`, `crates/`)
- ❌ No obvious hard-crash patterns (`process.exit`, infinite loops, empty catch-then-throw)
- ❌ No unhandled error paths in routers/billing/auth
- ❌ No direct `throw` without proper error wrapping in public APIs

### 3. Performance Gates (automated, advisory but monitored)

- 📦 Total dependency footprint ≤ 100MB (node_modules)
- 📦 Build artifact size ≤ 25MB (dist/ + target/)
- 🔗 Maximum import chain depth ≤ 8 (cold start risk)
- 📈 No new duplicate module dependencies

### 4. Billing & Tenancy (automated)

- `src/billing/stripe.ts` has no direct secret exposure (uses env vars only)
- Usage reporting maintains UUID + timestamp + tenantId audit trail
- Cost calculations preserve precision (no rounding drift)

### 5. Release Notes & Documentation (manual but required)

- CHANGELOG.md updated with user-facing changes
- Breaking changes documented with migration path
- New config options documented with defaults
- Security fixes called out explicitly

### 6. Git State (automated + manual)

- HEAD is on release branch (or main) with upcoming version tag
- No uncommitted changes in production code
- All commits on release branch are signed or verified
- Merge commits are squashed (no merge commits in release history)

## Release Blocker Categories

| Category | Example | Action |
|----------|---------|--------|
| **Critical** | Secret leaked, env file committed, billing calculation broken | BLOCK - fix before release |
| **High** | Build failure, test regression, type error | BLOCK - fix before release |
| **Medium** | Lint violation, advisory duplicate module | BLOCK until reviewed |
| **Low** | Documentation gap, minor perf regression | WAIVE with issue filed |

## Release Cadence

- Nightly builds: `cargo build --workspace && npm run build`
- Canary releases: after CI passes, run `npm run verify:release` then `git tag`
- Stable releases: require manual QA sign-off + security audit + verify:release

## Post-Release Verification

Within 1h of release:
- Deploy to staging, run smoke tests
- Verify billing webhook receives usage records
- Confirm no crashes in router/policy engine
- Monitor error budgets (Sentry/telemetry)
