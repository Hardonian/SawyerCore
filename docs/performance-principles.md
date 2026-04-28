# Performance Principles

- Determinism beats opportunistic throughput.
- No runtime allocation inside hot loops unless benchmarked.
- SIMD and assembly hot paths must sit behind feature gates.
- Scalar implementations are mandatory for portability and correctness.
- Benchmarks must exist for any performance-sensitive subsystem.

Current microbenchmarks cover:

- event queue throughput
- arena allocation pressure
- scalar vs dispatched dot product
- deterministic replay overhead
