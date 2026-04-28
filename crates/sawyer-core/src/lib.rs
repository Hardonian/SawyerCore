//! Runtime primitives for SawyerCore.

use sawyer_kernels::{detect_cpu_features, CpuFeatures};
use sawyer_memory::Arena;
use sawyer_scheduler::Scheduler;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub step_ns: u64,
    pub arena_capacity: usize,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            step_ns: 1_000_000,
            arena_capacity: 1024 * 1024,
        }
    }
}

pub struct DeterministicRuntime {
    scheduler: Scheduler,
    arena: Arena,
    cpu: CpuFeatures,
}

impl DeterministicRuntime {
    pub fn new(config: RuntimeConfig) -> Self {
        Self {
            scheduler: Scheduler::new(config.step_ns),
            arena: Arena::with_capacity(config.arena_capacity),
            cpu: detect_cpu_features(),
        }
    }

    pub fn step(&mut self) {
        self.scheduler.step();
    }

    pub fn reset_memory(&mut self) {
        self.arena.reset();
    }

    pub fn cpu_features(&self) -> CpuFeatures {
        self.cpu
    }

    pub fn tick(&self) -> u64 {
        self.scheduler.tick()
    }
}
