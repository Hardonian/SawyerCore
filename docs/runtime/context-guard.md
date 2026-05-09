# Context Budget Guard

The edge runtime enforces deterministic context controls before model execution:

- `max_input_size`: hard reject if exceeded.
- `chunk_threshold`: medium inputs degrade to chunk+summarize.
- `reject_threshold`: large inputs are rejected with explicit reason.

Model calls are only attempted after planner execution and guard checks.
