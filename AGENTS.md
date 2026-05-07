# AGENTS

## Project doctrine

- Keep deterministic behavior as the default.
- Never claim model, SIMD, or GPU support when unavailable.
- Preserve truthful degraded states in CLI and HTTP responses.
- Benchmark before making performance claims.

## Contribution checklist

1. `cargo fmt --all`
2. `cargo clippy --workspace --all-targets -- -D warnings`
3. `cargo test --workspace`
4. `cargo bench -p sawyer-core --bench microbench --no-run`

## Release posture

- Localhost-first networking defaults.
- Explicit errors over silent fallback.
- No secrets in repository; use `.env.example` only.

## SaaS architecture

### Billing (`/billing`)

- Stripe integration: `src/billing/stripe.ts`
- Usage tracking: `src/billing/usage-tracker.ts`
- Pricing tiers: `src/billing/pricing.ts`
- Billing controller: `src/billing/controller.ts`
- Router: `src/billing/router.ts`
- Tracks per-task, per-compute, per-agent-run usage
- All usage records have UUID, timestamp, tenantId for audit trail

### Public API (`/api`)

- Tenant management: `src/api/tenant-manager.ts`
- Runtime integration: `src/api/runtime.ts`
- Router: `src/api/router.ts`
- API key auth via `x-api-key` header
- Scope-based access control
- Shareable outputs with optional password protection
- Referral system for viral loops

### Growth (`/growth`)

- Growth engine: `src/growth/engine.ts`
- Router: `src/growth/router.ts`
- A/B testing with deterministic variant assignment
- Landing page management with conversion tracking
- Viral loop definitions and reward tracking
- Campaign management and metrics

### Tenancy (`/tenancy`)

- Isolation controller: `src/tenancy/controller.ts`
- Middleware: `src/tenancy/middleware.ts`
- Strict tenant isolation - no cross-tenant data access
- Resource partitions prevent tenant data leakage
- Rate limiting per tenant
- Scope-based permission enforcement

### Onboarding (`/saas`)

- Onboarding flow: `src/saas/onboarding.ts`
- Automated tenant creation with plan assignment
- API key generation and resource limit setup
- Referral code processing during signup
- 14-day trial default for all new tenants

### Rust server billing

- `BillingState` in `crates/sawyer-server/src/lib.rs`
- Tenant registration and API key validation
- Per-tenant usage tracking (tasks, compute, agent runs, API calls)
- Quota enforcement middleware
- Usage reporting endpoints: `GET /billing/usage/:tenant_id`
- Chat endpoint records task and compute usage automatically

### Verification

- Billing matches usage exactly (no rounding errors)
- Tenants cannot access each other's data, configs, or resources
- New users onboarded automatically via `OnboardingFlow`
- All tests in `tests/saas/` cover billing, isolation, growth, and onboarding
