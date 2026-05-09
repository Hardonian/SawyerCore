//! Structured state store for multi-agent system memory.

use std::collections::{HashMap, VecDeque};

use crate::core::orchestration::{DecisionTrace, RunMetrics};
use crate::core::task_graph::GraphStats;
use crate::memory::compression::compress_outcome;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunOutcome {
    pub run_id: String,
    pub success: bool,
    pub metrics: RunMetrics,
    pub graph_stats: GraphStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPerformance {
    pub agent_id: String,
    pub total_runs: usize,
    pub successful_runs: usize,
    pub avg_cost_micros: u64,
    pub avg_latency_ms: u128,
    pub failure_rate: f64,
}

pub struct StateStore {
    run_outcomes: VecDeque<RunOutcome>,
    agent_performances: HashMap<String, AgentPerformance>,
    decision_traces: Vec<DecisionTrace>,
    max_history: usize,
}

impl StateStore {
    pub fn new() -> Self {
        Self {
            run_outcomes: VecDeque::with_capacity(1000),
            agent_performances: HashMap::new(),
            decision_traces: Vec::new(),
            max_history: 1000,
        }
    }

    pub fn record_outcome(&mut self, outcome: RunOutcome) {
        self.run_outcomes.push_back(outcome);
        while self.run_outcomes.len() > self.max_history {
            self.run_outcomes.pop_front();
        }

        for trace in &self.run_outcomes.back().unwrap().metrics.decision_traces {
            self.decision_traces.push(trace.clone());
        }

        self.update_agent_performance(&outcome);
    }

    pub fn outcomes(&self) -> Vec<RunOutcome> {
        self.run_outcomes.iter().cloned().collect()
    }

    pub fn decision_traces(&self) -> &[DecisionTrace] {
        &self.decision_traces
    }

    pub fn get_agent_performance(&self, agent_id: &str) -> Option<AgentPerformance> {
        self.agent_performances.get(agent_id).cloned()
    }

    pub fn generate_optimization_suggestions(&self) -> Vec<String> {
        let mut suggestions = Vec::new();

        if self.run_outcomes.is_empty() {
            suggestions.push("no historical data available for optimization".to_string());
            return suggestions;
        }

        let recent: Vec<_> = self.run_outcomes.iter().rev().take(10).collect();
        let failure_count = recent.iter().filter(|o| !o.success).count();
        let failure_rate = failure_count as f64 / recent.len() as f64;

        if failure_rate > 0.3 {
            suggestions.push(format!(
                "high failure rate in recent runs ({:.0}%), consider adding redundant task paths",
                failure_rate * 100.0
            ));
        }

        let avg_cost = recent.iter()
            .map(|o| o.metrics.total_cost_micros as f64)
            .sum::<f64>() / recent.len() as f64;
        let avg_fallback = recent.iter()
            .map(|o| o.metrics.fallback_count as f64)
            .sum::<f64>() / recent.len() as f64;

        if avg_fallback > 1.0 {
            suggestions.push(format!(
                "average fallback count {:.1} per run, improve primary agent reliability",
                avg_fallback
            ));
        }

        for (agent_id, perf) in &self.agent_performances {
            if perf.failure_rate > 0.2 {
                suggestions.push(format!(
                    "agent '{}' has {:.0}% failure rate, review execution strategy",
                    agent_id,
                    perf.failure_rate * 100.0
                ));
            }
        }

        if suggestions.is_empty() {
            suggestions.push("system performing within expected parameters".to_string());
        }

        suggestions
    }

    pub fn compress_history(&self) -> Vec<String> {
        let mut summaries = Vec::new();
        for outcome in &self.run_outcomes {
            let summary = compress_outcome(outcome);
            summaries.push(format!(
                "run={} success={} tasks={}/{} cost={}μs time={}ms fallbacks={} retries={}",
                summary.run_id,
                summary.success,
                summary.completed_tasks,
                summary.total_tasks,
                summary.total_cost_micros,
                summary.duration_ms,
                summary.fallback_count,
                summary.retry_count,
            ));
        }
        summaries
    }

    fn update_agent_performance(&mut self, outcome: &RunOutcome) {
        for trace in &outcome.metrics.decision_traces {
            let entry = self.agent_performances
                .entry(trace.agent.clone())
                .or_insert_with(|| AgentPerformance {
                    agent_id: trace.agent.clone(),
                    total_runs: 0,
                    successful_runs: 0,
                    avg_cost_micros: 0,
                    avg_latency_ms: 0,
                    failure_rate: 0.0,
                });

            entry.total_runs += 1;
            if outcome.success {
                entry.successful_runs += 1;
            }
            entry.avg_cost_micros = trace.cost_micros;
            entry.avg_latency_ms = outcome.metrics.duration_ms;
            entry.failure_rate = if entry.total_runs > 0 {
                (entry.total_runs - entry.successful_runs) as f64 / entry.total_runs as f64
            } else {
                0.0
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::orchestration::RunMetrics;

    fn make_outcome(run_id: &str, success: bool) -> RunOutcome {
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
                fallback_count: 0,
                retry_count: 0,
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
    fn state_store_records_outcomes() {
        let mut store = StateStore::new();
        store.record_outcome(make_outcome("run-1", true));
        store.record_outcome(make_outcome("run-2", false));

        assert_eq!(store.outcomes().len(), 2);
    }

    #[test]
    fn state_store_generates_suggestions() {
        let mut store = StateStore::new();
        store.record_outcome(make_outcome("run-1", false));
        store.record_outcome(make_outcome("run-2", false));
        store.record_outcome(make_outcome("run-3", true));

        let suggestions = store.generate_optimization_suggestions();
        assert!(!suggestions.is_empty());
    }

    #[test]
    fn state_store_compresses_history() {
        let mut store = StateStore::new();
        store.record_outcome(make_outcome("run-1", true));
        store.record_outcome(make_outcome("run-2", false));

        let compressed = store.compress_history();
        assert_eq!(compressed.len(), 2);
    }
}
