# SawyerCore Scope Map

## Core Components (Essential for Deterministic Execution & Edge Efficiency)

### Runtime Core
- `src/runtime/core/deterministic-engine.ts` - Deterministic task execution engine
- `src/runtime/core/execution-log.ts` - Execution logging for audit trails
- `src/runtime/core/run-identity.ts` - Task identity management

### Policy & Governance
- `src/governance/autonomy-contract.ts` - Autonomy enforcement contracts
- `src/policy/policy-engine.ts` - Resource-aware policy enforcement
- `src/intelligence/policy/rule-engine.ts` - Policy rule evaluation

### Offline-First Infrastructure
- `src/offline/queue.ts` - Task queuing for offline execution
- `src/offline/state.ts` - Offline state persistence
- `src/offline/sync.ts` - Idempotent sync on reconnection
- `docs/runtime/offline-first-mode.md` - Operational specification

### Hardware Awareness
- `src/hardware/probe.ts` - CPU/GPU feature detection
- `src/hardware/profile.ts` - Hardware profiling and caching
- `src/runtime/scheduler/hardware-aware-scheduler.ts` - Hardware-aware task scheduling
- `docs/runtime/hardware-aware-scheduling.md` - Scheduling policy

### Plugin System
- `src/plugins/loader.ts` - Secure plugin loading with sandboxing
- `src/plugins/manifest.ts` - Plugin manifest validation
- `src/plugins/permissions.ts` - Permission scoping for plugins
- `src/plugins/sandbox.ts` - Plugin execution isolation
- `docs/developers/plugin-manifest.md` - Plugin development guide

### Tenancy & Isolation
- `src/tenancy/controller.ts` - Tenant isolation enforcement
- `src/tenancy/middleware.ts` - Request-level tenant isolation
- `src/tenancy/types.ts` - Tenant configuration and resource limits
- `src/api/tenant-manager.ts` - Multi-tenant API management

### Billing & Usage Tracking
- `src/billing/usage-tracker.ts` - Per-tenant usage aggregation
- `src/billing/controller.ts` - Billing API endpoints
- `src/billing/pricing.ts` - Tiered pricing model
- `src/billing/stripe.ts` - Stripe integration
- `src/billing/router.ts` - Billing API routing
- `crates/sawyer-server/src/lib.rs` - Server-side billing state

### Observability & Explainability
- `src/observability/audit.ts` - Audit trail generation
- `src/runtime/explain/explain.ts` - Decision explanation engine
- `src/runtime/memory/prompt-memory.ts` - Prompt caching for explainability
- `src/runtime/memory/rule-graph.ts` - Rule execution tracing

### Core CLI
- `crates/sawyer-cli/src/main.rs` - Command-line interface
- `src/cli/sawyer-init.ts` - Initialization wizard
- `src/cli/sawyer-doctor.ts` - System diagnostics

### Essential Tests
- `tests/saas/` - Multi-tenant billing and isolation tests
- `crates/sawyer-server/src/lib.rs` tests - Server billing validation

## Leverage Components (Strengthen Core Value Propositions)

### Growth & Viral Loops
- `src/growth/engine.ts` - A/B testing and experimentation framework
- `src/growth/router.ts` - Growth API endpoints
- `src/growth/types.ts` - Growth experiment configuration
- `docs/growth/` - Growth strategy documentation

### Marketplace
- `src/marketplace/catalog.ts` - Plugin catalog management
- `src/marketplace/install.ts` - Secure plugin installation
- `src/marketplace/verification.ts` - Plugin integrity verification
- `docs/marketplace/operator-guide.md` - Marketplace operations

### Intelligence Layer
- `src/intelligence/decision-engine.ts` - Routing decision logic
- `src/intelligence/insight-generator.ts` - Usage pattern analysis
- `src/intelligence/pattern-engine.ts` - Behavioral pattern detection
- `src/intelligence/prediction-system.ts` - Performance prediction
- `src/intelligence/failure/` - Failure analysis and prediction
- `src/intelligence/knowledge/` - Knowledge graph for reasoning
- `src/intelligence/optimizer/` - Resource optimization algorithms

### Runtime Enhancements
- `src/runtime/cache/` - Semantic caching for repeated tasks
- `src/runtime/compression/` - Response compression for bandwidth efficiency
- `src/runtime/cost/` - Cost modeling and budget enforcement
- `src/runtime/memory/knowledge-pack.ts` - Knowledge distillation
- `src/runtime/prompts/` - Recursive prompt optimization
- `src/runtime/safety/` - Resource monitoring and model scaling
- `src/runtime/trace/` - Execution trace recording

### SDK & Developer Experience
- `src/sdk/developer-guide.md` - SDK usage documentation
- `src/types/config.ts` - Type-safe configuration system
- `src/types/contracts.ts` - API contract definitions
- `docs/sdk/` - SDK reference materials

### UI & Configuration
- `src/ui/runtime-settings.ts` - Runtime configuration UI
- `docs/configuration/` - Configuration guides
- `docs/install/` - Platform-specific installation guides
- `docs/onboarding/device-wizard.md` - Guided setup

### Verification & Quality
- `docs/verification/ai-runtime-tests.md` - AI runtime validation
- `docs/verification/` - Verification methodology
- `scripts/` - Development and verification scripts

## Optional Components (Nice-to-Have but Not Essential)

### Analytics & Reporting
- `docs/recommendations/recommendation-engine.md` - Recommendation system
- `src/runtime/recommendation-engine.ts` - Recommendation implementation

### Advanced Deployment
- `docs/deploy/` - Various deployment strategies
- `docs/build/` - Build optimization guides

### Performance Optimization
- `docs/performance/dependency-budget.md` - Dependency management
- `docs/performance-principles.md` - Performance guidelines

### Release Management
- `docs/release/process.md` - Release procedures
- `docs/repo-os/release-bar.md` - Release quality gates

### Documentation & Examples
- `docs/architecture/` - System architecture docs
- `docs/concepts.md` - Core concepts explanation
- `docs/model-sizing.md` - Model resource requirements
- `docs/modes.md` - Runtime mode explanations
- `docs/quickstart.md` - Getting started guide
- `examples/` - Usage examples

## Speculative Components (Questionable Value, Needs Validation)

### Experimental Features
- `src/intelligence/failure/analyzer.ts` - Failure prediction (needs validation)
- `src/intelligence/failure/patterns.ts` - Failure pattern database
- `src/intelligence/knowledge/compiler.ts` - Knowledge compilation (early stage)
- `src/intelligence/knowledge/graph.ts` - Knowledge graph implementation
- `src/system/health/self-healer.ts` - Autonomous healing (complexity concern)
- `src/system/events/` - Event-driven architecture (over-engineering risk)

### Questionable Abstractions
- `src/system/execution-graph.ts` - Complex execution tracking (may be overkill)
- `src/system/autonomy/` - Advanced autonomy loops (needs validation)
- `src/mesh/` - Service mesh functionality (may exceed scope)
- `src/capabilities/` - Capability registry (unclear value proposition)

### Documentation Gaps
- `docs/developers/getting-started.md` - Duplicate of quickstart
- `docs/developers/security-model.md` - Needs more concrete implementation details
- `docs/repo-os/failure-taxonomy.md` - Overly detailed failure classification
- `docs/repo-os/operator-truth.md` - Philosophical rather than practical

## Remove/Defer (No Clear Value or Active Harm)

### Bloat Candidates
- `src/system/health/health-aggregator.ts` - Simple aggregation could be inline
- `src/system/health/system-state.ts` - Basic state tracking
- `src/api/runtime.ts` - Minimal runtime integration
- `src/api/types.ts` - Basic API type definitions

### Questionable Claims
- `docs/architecture/sawyer-runtime.md` - Overstates current capabilities
- `docs/architecture/governance-policy.md` - Aspirational rather than descriptive
- `docs/verification.md` - Outdated verification approach
- `docs/concepts.md` - Too theoretical, needs practical focus

### Redundant Documentation
- Multiple OS-specific install guides with identical content
- Overlapping performance documentation
- Duplicate API reference materials

## Verification Status

All core components must pass:
- `npm run typecheck` - Zero TypeScript errors
- `npm run lint` - Zero ESLint errors  
- `npm test` - 100% test pass rate
- `npm run build` - Clean production build
- `cargo test --workspace` - All Rust tests pass
- `cargo clippy --workspace` - Zero clippy warnings

## Minimum Viable Onboarding Path

1. **Install** - Platform-specific binary or cargo install
2. **Configure** - Basic config via `sawyer init` or env vars
3. **Run** - `sawyer up` to start local runtime
4. **Verify** - `sawyer doctor` confirms healthy operation

This path delivers edge efficiency, deterministic execution, governed autonomy, offline-first value, plugin readiness, revenue potential, and operator trust without bloat or speculation.