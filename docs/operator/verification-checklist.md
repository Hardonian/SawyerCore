# SawyerCore Operator Verification Checklist

## Pre-Verification
- [ ] SawyerCore version known: `cargo run -p sawyer-cli -- version`
- [ ] Environment variables loaded: `cat .env` (check SAWYER_MODE, SAWYER_DATA_DIR, SAWYER_HTTP_PORT)
- [ ] Service is running: `ps aux | grep sawyer` or `curl -s http://127.0.0.1:8080/status`

## Core Functionality
- [ ] HTTP API responsive: `curl -s http://127.0.0.1:8080/status | jq .`
- [ ] Mode reporting: `cargo run -p sawyer-cli -- mode current`
- [ ] Last explainable decision: `curl -s http://127.0.0.1:8080/explain/last | jq .`

## Hardware Verification
- [ ] Hardware verification passes: `npm run verify:hardware`
- [ ] Resource constraints understood: Review output of hardware verification

## Offline Capability
- [ ] Offline verification passes: `npm run verify:offline`
- [ ] Confirmed local-first operation: No external dependencies required for core functions

## Plugin Safety
- [ ] Plugin verification passes: `npm run verify:plugins`
- [ ] Plugins sourced from trusted providers
- [ ] Plugin manifests reviewed for permissions

## SDK & Marketplace
- [ ] SDK verification passes: `npm run verify:sdk`
- [ ] Marketplace verification passes: `npm run verify:marketplace`

## AI Runtime
- [ ] AI runtime verification passes: `npm run verify:ai`
- [ ] Provider comparison functional: `cargo run -p sawyer-cli -- compare`

## Determinism & Safety
- [ ] Determinism verification passes: `npm run verify:determinism`
- [ ] Low resource verification passes: `npm run verify:low-resource`
- [ ] Degraded modes verification passes: `npm run verify:degraded-modes`

## System Verification
- [ ] End-to-end verification passes: `npm run verify:end-to-end`
- [ ] Autonomy verification passes: `npm run verify:autonomy`
- [ ] Cost efficiency verification passes: `npm run verify:cost-efficiency`
- [ ] Security verification passes: `npm run verify:security`

## Rust Toolchain
- [ ] Rust-only verification passes: `npm run verify:rust`
- [ ] Cargo build successful: `cargo build --workspace`

## Repository & CI
- [ ] Repository state verification passes: `npm run verify:repo-state`
- [ ] CI health verification passes: `npm run verify:ci-health`

## Release (if applicable)
- [ ] Release verification passes: `npm run verify:release`
- [ ] Release artifacts validated: Check `artifacts/release/` for latest sentinel reports

## Recovery Validation
- [ ] Doctor reports healthy: `cargo run -p sawyer-cli -- doctor`
- [ ] Service restarts successfully after planned stop
- [ ] Data persistence validated across restarts (if applicable)

## Operator Notes
- Run this checklist after installation, configuration changes, or updates
- Any failed verification requires troubleshooting before considering system operational
- Keep record of verification outputs for audit and support purposes
- For air-gapped environments, all verifications must pass without external connectivity (except optional plugin marketplace)