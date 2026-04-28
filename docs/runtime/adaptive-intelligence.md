# Adaptive Self-Tuning Runtime Intelligence (v1.1)

SawyerCore v1.1 adds deterministic, explainable adaptation based on observed execution telemetry.

## Safety boundaries

Adaptive logic cannot:

- enable cloud fallback when private mode is active
- bypass provider health checks
- raise configured cost caps
- override deterministic policy ordering
- mutate hidden state outside explicit telemetry/history stores

## Configuration

```toml
enable_adaptive_routing = true
adaptive_window_size = 100
adaptive_confidence_threshold = 0.7
```

## Explainability

Use `sawyer explain adaptive` to print:

- what changed in score
- reason codes
- telemetry basis
- confidence
