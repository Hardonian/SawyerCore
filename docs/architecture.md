# Architecture

SawyerCore uses a Rust workspace with explicit crate boundaries:

1. **Runtime Layer** (`sawyer-core`, `sawyer-scheduler`, `sawyer-memory`)
2. **Kernel Layer** (`sawyer-kernels`) with CPU feature detection and safe fallback paths
3. **Model Adapter Layer** (`sawyer-llm`) with truthful unavailable states
4. **Simulation Layer** (`sawyer-sim`) with deterministic event replay
5. **Operator Layer** (`sawyer-cli`, `sawyer-server`) for local control and API serving

Data flows from CLI/API into runtime/simulation with explicit metrics and degraded states.
