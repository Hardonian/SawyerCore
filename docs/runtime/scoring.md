# Adaptive Scoring

Scoring model:

```text
score = base_score + telemetry_adjustment
```

Policy gates run first and are non-overridable:

1. private mode cloud block
2. unhealthy provider block
3. cost cap block

Telemetry adjustments include:

- fast provider boost
- failure penalty
- cooldown penalty after repeated failures
- task-fit historical boost

All adjustments emit reason codes in score breakdowns.
