//! Outcome compression for long-term memory storage.

use crate::memory::state_store::RunOutcome;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutcomeSummary {
    pub run_id: String,
    pub success: bool,
    pub total_tasks: usize,
    pub completed_tasks: usize,
    pub failed_tasks: usize,
    pub total_cost_micros: u64,
    pub duration_ms: u128,
    pub fallback_count: u32,
    pub retry_count: u32,
}

pub fn compress_outcome(outcome: &RunOutcome) -> OutcomeSummary {
    OutcomeSummary {
        run_id: outcome.run_id.clone(),
        success: outcome.success,
        total_tasks: outcome.metrics.total_tasks,
        completed_tasks: outcome.metrics.completed_tasks,
        failed_tasks: outcome.metrics.failed_tasks,
        total_cost_micros: outcome.metrics.total_cost_micros,
        duration_ms: outcome.metrics.duration_ms,
        fallback_count: outcome.metrics.fallback_count,
        retry_count: outcome.metrics.retry_count,
    }
}
