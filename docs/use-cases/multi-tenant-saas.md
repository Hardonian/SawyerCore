# Multi-Tenant SaaS Architecture Guide

SawyerCore provides out-of-the-box infrastructure for powering B2B AI SaaS applications.

---

## Core Tenancy Infrastructure

### 1. Data Isolation
Every API request is guarded by tenant-level authorization middleware (`src/tenancy/middleware.ts`):
- Strict tenant key partitioning ensures Tenant A cannot view or execute workloads on Tenant B's agent workflows or shareable outputs.
- Knowledge Packs and rule graphs are partitioned by tenant namespace.

### 2. Quota & Rate Limiting
- Configurable per-tenant limits for concurrent tasks, API calls per minute, storage bytes, and active agents.
- When limits are hit, requests are rejected with a structured `429 Quota Exceeded` response.

### 3. Usage-Based Stripe Billing
- The usage tracker (`src/billing/usage-tracker.ts`) logs per-task compute and token usage.
- Integrated Stripe subscription and metered invoice generation (`src/billing/stripe.ts`).
- Audit trail preserves exact timestamps and UUIDs for compliance and dispute resolution.

### 4. Viral Loops & Referrals
- Built-in referral engine (`src/growth/engine.ts`) with reward tracking and deterministic A/B test variant assignment.
