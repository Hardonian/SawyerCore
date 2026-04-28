//! Runtime primitives for SawyerCore.

use sawyer_history::{AdaptiveConfig, HistoryIndex, ScoreBreakdown};
use sawyer_kernels::{detect_cpu_features, CpuFeatures};
use sawyer_memory::Arena;
use sawyer_scheduler::Scheduler;
use sawyer_telemetry::RequestTelemetry;
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

pub struct AdaptiveRoutingEngine {
    config: AdaptiveConfig,
    history: HistoryIndex,
}

impl AdaptiveRoutingEngine {
    pub fn new(config: AdaptiveConfig) -> Self {
        Self {
            history: HistoryIndex::new(config.adaptive_window_size),
            config,
        }
    }

    pub fn record(&mut self, request: RequestTelemetry) {
        self.history.push(request);
    }

    pub fn score_candidate(
        &self,
        provider: &str,
        task_type: &str,
        base_score: i32,
        now_ms: u64,
        is_cloud: bool,
        estimated_cost_micros: u64,
        unhealthy: bool,
    ) -> ScoreBreakdown {
        self.history.score_provider(
            &self.config,
            provider,
            task_type,
            base_score,
            now_ms,
            is_cloud,
            estimated_cost_micros,
            unhealthy,
        )
    }
}
