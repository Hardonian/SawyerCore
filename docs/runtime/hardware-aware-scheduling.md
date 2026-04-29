# Hardware-Aware Scheduling

SawyerCore dynamically routes tasks based on real-time hardware telemetry.

## Telemetry Probes

## Architecture

- **Telemetry**: Continuous monitoring of CPU, RAM, and GPU.
- **Tiering**: Categorizing hardware into `TINY`, `LOCAL`, and `PERFORMANCE`.
- **Routing**: Decisions based on resource availability and task constraints.

## Task States

- **CPU**: Core count and load.
- **Memory**: Total and available RAM.
- **GPU**: NVIDIA GPU availability and VRAM pressure via `nvidia-smi`.
- **Disk**: Pressure levels on the root partition.
- **Power**: AC vs Battery vs Low Power mode.

## Scheduling States

- `LOCAL_OK`: Full local execution supported.
- `LOCAL_CONSTRAINED`: Resources low, using smaller models or limited logic.
- `GPU_UNAVAILABLE`: Falling back to CPU execution.
- `LOW_MEMORY`: Memory pressure detected, restricting task budget.
- `LOW_POWER`: Throttling background tasks to preserve battery.
- `REMOTE_REQUIRED`: Hardware insufficient for task, routing to remote node.
- `DEGRADED_LOCAL_ONLY`: No remote available, running in minimal local mode.

## Configuration
Limits are defined in the `AutonomyContract`. Tasks that exceed their declared budget or available system resources will be routed to remote nodes or rejected with a `DEGRADED` status.
