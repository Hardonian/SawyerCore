//! Optimizer agent - analyzes performance metrics and suggests improvements.

use std::collections::HashMap;

use crate::memory::{StateStore, RunOutcome};
use crate::roles::agent_role::{AgentRole, AgentId, CostProfile, AgentResult};
use crate::core::task_graph::TaskNode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationSuggestion {
    pub target: String,
    pub action: String,
    pub expected_improvement: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizerConfig {
    pub min_runs_for_analysis: usize,
    pub cost_reduction_target: f64,
    pub latency_reduction_target: f64,
}

impl Default for OptimizerConfig {
    fn default() -> Self {
        Self {
            min_runs_for_analysis: 3,
            cost_reduction_target: 0.10,
            latency_reduction_target: 0.15,
        }
    }
}

pub struct OptimizerAgent {
    id: String,
    config: OptimizerConfig,
    state_store: StateStore,
}

impl OptimizerAgent {
    pub fn new(config: OptimizerConfig, state_store: StateStore) -> Self {
        Self {
            id: "optimizer".to_string(),
            config,
            state_store,
        }
    }

    pub fn analyze(&self) -> Vec<OptimizationSuggestion> {
        let outcomes = self.state_store.outcomes();
        if outcomes.len() < self.config.min_runs_for_analysis {
            return vec![OptimizationSuggestion {
                target: "system".to_string(),
                action: format!("need at least {} runs before optimization analysis", self.config.min_runs_for_analysis),
                expected_improvement: "N/A".to_string(),
                confidence: 0.0,
            }];
        }

        let mut suggestions = Vec::new();

        let avg_cost = outcomes.iter()
            .map(|o| o.metrics.total_cost_micros as f64)
            .sum::<f64>() / outcomes.len() as f64;

        let avg_fallbacks = outcomes.iter()
            .map(|o| o.metrics.fallback_count as f64)
            .sum::<f64>() / outcomes.len() as f64;

        let avg_retries = outcomes.iter()
            .map(|o| o.metrics.retry_count as f64)
            .sum::<f64>() / outcomes.len() as f64;

        let failure_rate = outcomes.iter()
            .filter(|o| !o.success)
            .count() as f64 / outcomes.len() as f64;

        if avg_fallbacks > 1.0 {
            suggestions.push(OptimizationSuggestion {
                target: "fallback_chain".to_string(),
                action: "reduce fallback triggers by improving primary agent reliability".to_string(),
                expected_improvement: format!("{:.0}% fewer fallbacks", avg_fallbacks * 100.0),
                confidence: 0.8,
            });
        }

        if avg_retries > 2.0 {
            suggestions.push(OptimizationSuggestion {
                target: "retry_strategy".to_string(),
                action: "implement adaptive backoff to reduce retry count".to_string(),
                expected_improvement: format!("{:.0}% fewer retries", avg_retries * 100.0),
                confidence: 0.75,
            });
        }

        if failure_rate > 0.2 {
            suggestions.push(OptimizationSuggestion {
                target: "task_graph".to_string(),
                action: "add redundant paths for high-failure tasks".to_string(),
                expected_improvement: format!("reduce failure rate from {:.0}% to target", failure_rate * 100.0),
                confidence: 0.6,
            });
        }

        if suggestions.is_empty() {
            suggestions.push(OptimizationSuggestion {
                target: "system".to_string(),
                action: "no critical optimizations identified".to_string(),
                expected_improvement: "maintain current performance".to_string(),
                confidence: 1.0,
            });
        }

        suggestions
    }

    pub fn apply_feedback(&mut self, run_outcome: RunOutcome) {
        self.state_store.record_outcome(run_outcome);
    }
}

impl AgentRole for OptimizerAgent {
    fn id(&self) -> &str {
        &self.id
    }

    fn role_name(&self) -> &str {
        "optimizer"
    }

    fn execute(&self, task: &TaskNode) -> AgentResult {
        let suggestions = self.analyze();
        let summary = suggestions.iter()
            .map(|s| format!("- {} -> {}: {} (confidence: {:.2})", s.target, s.action, s.expected_improvement, s.confidence))
            .collect::<Vec<_>>()
            .join("\n");

        Ok(format!("optimization analysis for {}:\n{}", task.label, summary))
    }

    fn cost_profile(&self) -> CostProfile {
        CostProfile {
            base_cost_micros: 200,
            per_token_cost_micros: 1,
            max_tokens: 512,
        }
    }

    fn can_handle(&self, task_type: &str) -> bool {
        matches!(task_type, "optimization" | "analysis" | "feedback" | "improvement")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::task_graph::TaskNode;
    use crate::memory::RunOutcome;
    use crate::core::orchestration::RunMetrics;

    fn make_outcome(run_id: &str, success: bool, fallback_count: u32) -> RunOutcome {
        use crate::core::task_graph::GraphStats;
        RunOutcome {
            run_id: run_id.to_string(),
            success,
            metrics: RunMetrics {
                run_id: run_id.to_string(),
                total_tasks: 5,
                completed_tasks: if success { 5 } else { 3 },
                failed_tasks: if success { 0 } else { 2 },
                skipped_tasks: 0,
                total_cost_micros: 1000,
                duration_ms: 500,
                fallback_count,
                retry_count: 1,
                deadlock_detected: false,
                decision_traces: vec![],
            },
            graph_stats: GraphStats {
                total: 5,
                completed: if success { 5 } else { 3 },
                failed: if success { 0 } else { 2 },
                pending: 0,
                running: 0,
                skipped: 0,
                total_cost_micros: 1000,
            },
        }
    }

    #[test]
    fn optimizer_analyzes_outcomes() {
        let config = OptimizerConfig {
            min_runs_for_analysis: 2,
            ..Default::default()
        };
        let mut optimizer = OptimizerAgent::new(config, StateStore::new());

        optimizer.apply_feedback(make_outcome("run-1", true, 3));
        optimizer.apply_feedback(make_outcome("run-2", false, 2));

        let suggestions = optimizer.analyze();
        assert!(!suggestions.is_empty());
    }

    #[test]
    fn optimizer_returns_insufficient_data_message() {
        let optimizer = OptimizerAgent::new(OptimizerConfig::default(), StateStore::new());
        let suggestions = optimizer.analyze();
        assert_eq!(suggestions.len(), 1);
        assert!(suggestions[0].action.contains("need at least"));
    }

    #[test]
    fn optimizer_handles_correct_task_types() {
        let optimizer = OptimizerAgent::new(OptimizerConfig::default(), StateStore::new());
        assert!(optimizer.can_handle("optimization"));
        assert!(optimizer.can_handle("analysis"));
        assert!(!optimizer.can_handle("planning"));
    }
}
