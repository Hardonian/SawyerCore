# Verification Matrix

## Overview

This matrix defines all automated and manual verification gates required for any change to SawyerCore. Violating any required gate blocks release.

## Command Matrix

| Gate | Command | Category | Pass Criteria | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Type Check | `npm run typecheck` | Required | Zero TS errors | No `any` allowed |
| Lint | `npm run lint` | Required | Zero ESLint errors | No eslint-disable hacks |
| Unit Tests | `npm test` | Required | 100% pass | No flaky tests |
| Rust Build | `cargo build --workspace` | Required | Clean build | No warnings |
| Verify AI Runtime | `npm run verify:ai` | Required | Router + provider tests | |
| Verify Policy | `npm run verify:policy` | Required | Policy engine tests | |
| Verify Runtime | `npm run verify:runtime` | Required | Core runtime tests | |
| Verify Config | `npm run verify:config` | Required | Config loading tests | |
| Rust Clippy | `cargo clippy --workspace` | Required | Zero warnings | |
| Rust Test | `cargo test --workspace` | Required | 100% pass | |
| Determinism | `npm run verify:determinism` | Required | Non-determinism asserts | |
| Low Resource | `npm run verify:low-resource` | Required | Safety checks | |
| Degraded Modes | `npm run verify:degraded-modes` | Required | Graceful degradation | |
| End-to-End | `npm run verify:end-to-end` | System | Convergence passes | |
| Autonomy | `npm run verify:autonomy` | System | Autonomy checks | |
| Cost Efficiency | `npm run verify:cost-efficiency` | System | Cost routing valid | |
| Security | `npm run verify:security` | System | Security checks | |
| Release Sentinel | `npm run verify:release` | Release | All gates pass | Blocks release |
| Hardware | `npm run verify:hardware` | Ecosystem | Hardware detection valid | |
| Offline | `npm run verify:offline` | Ecosystem | Sync & queue functional | |
| Plugins | `npm run verify:plugins` | Ecosystem | Manifest & sandbox secure | |
| SDK | `npm run verify:sdk` | Ecosystem | Degraded state handling valid | |
| Marketplace | `npm run verify:marketplace` | Ecosystem | Install & rollback valid | |
| CI Health | `npm run verify:ci-health` | CI | Tools available | |
| Repo State | `npm run verify:repo-state` | Pre-commit | Clean state | |
| Footprint | `npm run perf:footprint` | Optional | Report generated | |

## Required Gates (Must ALL pass before release)

- [x] Typecheck clean
- [x] Lint clean
- [x] All tests passing
- [x] Rust build successful
- [x] Rust clippy clean
- [x] Release Sentinel cleared
- [x] Repo state clean (or `--allow-dirty`)
- [x] No committed env files
- [x] No secret leakage staged
- [x] No forbidden TODO/FIXME in critical paths
- [x] No hard-crash patterns detected
- [x] Hardware verification passed
- [x] Offline sync verification passed
- [x] Plugin security verification passed
- [x] SDK degraded-state verification passed
- [x] Marketplace rollback verification passed

## Optional/Advisory Gates

- Footprint report under threshold (currently: <100MB deps)
- No duplicate modules (advise dedupe)
- Import depth ≤ 8 (recommended)

## Verification Logic

Each gate MUST be:
1. **Deterministic** — same input → same result
2. **Evidence-based** — actual code/state inspection
3. **Non-fake** — must actually run, not just print "OK"
4. **Fast** — ≤60s for fast gates, ≤5min for full suite
5. **Local-first** — no network calls unless explicitly opted-in

## Override Policy

Overrides require:
- Explicit reason documented in PR
- Approved by ≥2 maintainers
- Temporary (max 30 days)
- Linked to tracking issue
