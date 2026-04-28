# Sawyer Runtime

## IMPLEMENTED
- Deterministic runtime path: request -> task contract -> policy engine -> provider health -> optimizer -> selected provider -> audit event -> response/degraded deny.
- Provider abstraction with honest health state and bounded transport semantics.
- Router-level fallback attempts across scored providers without route-level bypass.
- Degraded deny responses on provider runtime failure instead of hard crashes.

## CONFIG-DEPENDENT
- Provider endpoint availability.
- Timeout/retry budgets and fallback eligibility.
- Request-size/cost/token guardrails from governance config.

## STUBBED
- ONNX and Mobile NPU real execution backends.
- External telemetry collectors.

## FUTURE
- Adaptive routing tuned by real production SLO feedback.
