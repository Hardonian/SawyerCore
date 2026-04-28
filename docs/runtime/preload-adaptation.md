# Preload Adaptation

Preload planning uses rolling request history:

- provider/model usage frequency
- recency
- memory pressure snapshots

Behavior:

- preload most frequently used providers
- unload least-used entries
- if memory pressure exceeds safe threshold, skip preload and unload candidates

This planner is deterministic and bounded by safe memory thresholds.
