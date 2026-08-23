# Edge IoT & Robotics Guide

How SawyerCore powers constrained, power-sensitive, and offline-first robotics and IoT devices.

---

## Edge Resource Adaptation

### 1. Hardware-Aware Scaling
The hardware probe (`src/hardware/probe.ts`) evaluates:
- Available system RAM and CPU core count.
- Battery state (AC power vs battery drain).
- Thermal throttling status.

When power drops or memory pressure rises, SawyerCore automatically downscales model tiers (e.g. from `7B` to quantized `1.5B` or `0.5B`) to maintain real-time responsiveness without OOM crashing.

### 2. Offline Task Queueing
For drones, rovers, and subterranean sensors that lose connectivity:
- The offline queue (`src/offline/queue.ts`) stores incoming sensor tasks locally.
- When uplink is restored, `SyncManager` batches telemetry and synchronizes state with the control plane.

### 3. Context Guarding & Memory Compression
- Sliding window token compression (`src/runtime/compression.ts`) ensures local context buffers never exceed device memory limits.
