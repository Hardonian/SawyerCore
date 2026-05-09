# Recursive Planner

SawyerCore uses `sawyer-planner` to produce deterministic plans.

Plan steps:
- `UseKB`
- `Classify`
- `Extract`
- `Generate`
- `Refine`

Rules:
1. KB hit short-circuits to `UseKB`.
2. Otherwise the planner runs `Classify -> Extract -> Generate`.
3. Long input adds `Refine`.
4. `max_depth` and `max_plan_steps` are enforced.

The same input always yields the same plan under the same config.
