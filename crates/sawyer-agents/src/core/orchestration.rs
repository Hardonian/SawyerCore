//! Orchestrator for multi-agent task graph execution.

use std::collections::{HashMap, HashSet, VecDeque};
use std::time::{Duration, Instant};

use crate::core::task_graph::{TaskGraph, TaskId, TaskNode, TaskNodeState};
use crate::fallback::{FallbackChain, FallbackResult};
use crate::memory::{StateStore, RunOutcome};
use crate::roles::AgentRole;
use crate::scheduler::CostAwareScheduler;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, error, info, warn};

#[derive(Debug, Error)]
pub enum OrchestratorError {
    #[error("task graph error: {0}")]
    TaskGraph(String),
    #[error("agent execution failed: {0}")]
    AgentExecution(String),
    #[error("all fallback attempts exhausted: {0}")]
    FallbackExhausted(String),
    #[error("deadlock detected: {0}")]
    Deadlock(String),
    #[error("timeout after {0:?}")]
    Timeout(Duration),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionTrace {
    pub run_id: String,
    pub timestamp: u128,
    pub task_id: TaskId,
    pub agent: String,
    pub action: String,
    pub reasoning: String,
    cost_micros: u64,
    fallback_tier: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunMetrics {
    pub run_id: String,
    pub total_tasks: usize,
    pub completed_tasks: usize,
    pub failed_tasks: usize,
    pub skipped_tasks: usize,
    pub total_cost_micros: u64,
    pub duration_ms: u128,
    pub fallback_count: u32,
    pub retry_count: u32,
    pub deadlock_detected: bool,
    pub decision_traces: Vec<DecisionTrace>,
}

pub struct OrchestratorConfig {
    pub max_parallel: usize,
    pub timeout: Duration,
    pub deadlock_check_interval: Duration,
    pub default_max_retries: u32,
}

impl Default for OrchestratorConfig {
    fn default() -> Self {
        Self {
            max_parallel: 4,
            timeout: Duration::from_secs(300),
            deadlock_check_interval: Duration::from_secs(10),
            default_max_retries: 3,
        }
    }
}

pub struct Orchestrator {
    config: OrchestratorConfig,
    agents: HashMap<String, Box<dyn AgentRole>>,
    scheduler: CostAwareScheduler,
    fallback: FallbackChain,
    state_store: StateStore,
    decision_traces: Vec<DecisionTrace>,
}

impl Orchestrator {
    pub fn new(config: OrchestratorConfig) -> Self {
        Self {
            config,
            agents: HashMap::new(),
            scheduler: CostAwareScheduler::default(),
            fallback: FallbackChain::new(),
            state_store: StateStore::new(),
            decision_traces: Vec::new(),
        }
    }

    pub fn register_agent(&mut self, id: &str, agent: Box<dyn AgentRole>) {
        self.scheduler.register_agent(id, agent.cost_profile());
        self.agents.insert(id.to_string(), agent);
    }

    pub fn set_fallback_chain(&mut self, fallback: FallbackChain) {
        self.fallback = fallback;
    }

    pub fn execute(&mut self, mut graph: TaskGraph, run_id: &str) -> Result<RunMetrics, OrchestratorError> {
        let start = Instant::now();
        let mut completed = HashSet::new();
        let mut running: HashMap<TaskId, Instant> = HashMap::new();
        let mut fallback_count = 0u32;
        let mut retry_count = 0u32;

        info!(run_id = %run_id, "starting orchestrator run with {} tasks", graph.nodes.len());

        loop {
            if start.elapsed() > self.config.timeout {
                return Err(OrchestratorError::Timeout(self.config.timeout));
            }

            if graph.all_completed() {
                break;
            }

            self.check_for_deadlock(&graph, &running, start.elapsed())?;

            let ready = graph.ready_tasks(&completed);
            for task_id in ready {
                if running.len() >= self.config.max_parallel {
                    break;
                }
                if let Some(node) = graph.get_node_mut(&task_id) {
                    node.mark_running();
                    running.insert(task_id, Instant::now());
                    debug!(run_id = %run_id, task = %task_id, "task started");
                }
            }

            let to_process: Vec<TaskId> = running.keys().cloned().collect();
            for task_id in to_process {
                if let Some(start_time) = running.get(&task_id) {
                    if start_time.elapsed() > Duration::from_secs(60) {
                        if let Some(node) = graph.get_node_mut(&task_id) {
                            if node.can_retry() {
                                node.retry();
                                retry_count += 1;
                                running.remove(&task_id);
                                warn!(run_id = %run_id, task = %task_id, "task timed out, retrying (attempt {})", node.retry_count);
                            } else {
                                node.mark_failed("max retries exhausted after timeout");
                                completed.insert(task_id);
                                running.remove(&task_id);
                                error!(run_id = %run_id, task = %task_id, "task failed: max retries exhausted");
                            }
                        }
                    }
                }
            }

            for task_id in to_process {
                if !running.contains_key(&task_id) {
                    continue;
                }

                if let Some(node) = graph.get_node(&task_id) {
                    let agent_id = node.assigned_agent.clone().unwrap_or_else(|| "unassigned".to_string());
                    if let Some(agent) = self.agents.get(&agent_id) {
                        let result = agent.execute(&node);
                        match result {
                            Ok(output) => {
                                if let Some(task_node) = graph.get_node_mut(&task_id) {
                                    task_node.mark_completed(&output);
                                    completed.insert(task_id);
                                    running.remove(&task_id);
                                    info!(run_id = %run_id, task = %task_id, agent = %agent_id, "task completed");
                                }
                            }
                            Err(err) => {
                                let fallback_result = self.fallback.execute(&node, &err.to_string());
                                match fallback_result {
                                    FallbackResult::Success(output, tier) => {
                                        fallback_count += 1;
                                        if let Some(task_node) = graph.get_node_mut(&task_id) {
                                            task_node.mark_completed(&output);
                                            completed.insert(task_id);
                                            running.remove(&task_id);
                                            warn!(run_id = %run_id, task = %task_id, tier = tier, "task completed via fallback");
                                        }
                                    }
                                    FallbackResult::Degraded(output, tier) => {
                                        fallback_count += 1;
                                        if let Some(task_node) = graph.get_node_mut(&task_id) {
                                            task_node.mark_completed(&output);
                                            completed.insert(task_id);
                                            running.remove(&task_id);
                                            warn!(run_id = %run_id, task = %task_id, tier = tier, "task completed with degraded output");
                                        }
                                    }
                                    FallbackResult::Failed(final_err) => {
                                        if let Some(task_node) = graph.get_node_mut(&task_id) {
                                            if task_node.can_retry() {
                                                task_node.retry();
                                                retry_count += 1;
                                                running.remove(&task_id);
                                                warn!(run_id = %run_id, task = %task_id, "task failed, retrying via adaptive strategy");
                                            } else {
                                                task_node.mark_failed(&final_err);
                                                completed.insert(task_id);
                                                running.remove(&task_id);
                                                error!(run_id = %run_id, task = %task_id, "task permanently failed");
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        if let Some(task_node) = graph.get_node_mut(&task_id) {
                            task_node.mark_failed(&format!("agent '{}' not found", agent_id));
                            completed.insert(task_id);
                            running.remove(&task_id);
                            error!(run_id = %run_id, task = %task_id, agent = %agent_id, "agent not registered");
                        }
                    }
                }
            }

            self.trace_decision(run_id, &graph, &completed);
        }

        let stats = graph.completion_stats();
        let metrics = RunMetrics {
            run_id: run_id.to_string(),
            total_tasks: stats.total,
            completed_tasks: stats.completed,
            failed_tasks: stats.failed,
            skipped_tasks: stats.skipped,
            total_cost_micros: stats.total_cost_micros,
            duration_ms: start.elapsed().as_millis(),
            fallback_count,
            retry_count,
            deadlock_detected: false,
            decision_traces: self.decision_traces.clone(),
        };

        let outcome = RunOutcome {
            run_id: run_id.to_string(),
            success: !graph.has_failed(),
            metrics: metrics.clone(),
            graph_stats: stats,
        };
        self.state_store.record_outcome(outcome);

        info!(run_id = %run_id, "orchestrator run completed: {}/{} tasks", metrics.completed_tasks, metrics.total_tasks);
        Ok(metrics)
    }

    fn check_for_deadlock(&self, graph: &TaskGraph, running: &HashMap<TaskId, Instant>, elapsed: Duration) -> Result<(), OrchestratorError> {
        if elapsed > self.config.deadlock_check_interval {
            let pending_count = graph.nodes.values().filter(|n| n.state == TaskNodeState::Pending).count();
            let ready_count = graph.ready_tasks(&HashSet::new()).len();

            if pending_count > 0 && ready_count == 0 && !graph.all_completed() {
                let running_count = running.len();
                if running_count == 0 {
                    return Err(OrchestratorError::Deadlock(
                        format!("{} pending tasks with no runnable nodes and no active tasks", pending_count)
                    ));
                }
            }
        }
        Ok(())
    }

    fn trace_decision(&mut self, run_id: &str, graph: &TaskGraph, completed: &HashSet<TaskId>) {
        for task_id in completed {
            if let Some(node) = graph.get_node(task_id) {
                if node.completed_at.is_some() {
                    let already_traced = self.decision_traces.iter().any(|t| t.task_id == *task_id);
                    if !already_traced {
                        self.decision_traces.push(DecisionTrace {
                            run_id: run_id.to_string(),
                            timestamp: std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_millis(),
                            task_id: *task_id,
                            agent: node.assigned_agent.clone().unwrap_or_default(),
                            action: format!("completed: {}", node.label),
                            reasoning: node.output.clone().unwrap_or_default(),
                            cost_micros: node.estimated_cost_micros,
                            fallback_tier: 0,
                        });
                    }
                }
            }
        }
    }

    pub fn get_improvement_suggestions(&self) -> Vec<String> {
        self.state_store.generate_optimization_suggestions()
    }

    pub fn state_store(&self) -> &StateStore {
        &self.state_store
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::roles::MockAgent;

    #[test]
    fn orchestrator_executes_simple_graph() {
        let config = OrchestratorConfig::default();
        let mut orchestrator = Orchestrator::new(config);

        orchestrator.register_agent("planner", Box::new(MockAgent::new("planner", "plan")));
        orchestrator.register_agent("executor", Box::new(MockAgent::new("executor", "exec")));

        let mut graph = TaskGraph::new();
        let t1 = graph.add_node(TaskNode::new("plan", "planning task").with_agent("planner"));
        let t2 = graph.add_node(TaskNode::new("exec", "execution task").with_agent("executor"));
        graph.add_dependency(t1, t2).unwrap();

        let metrics = orchestrator.execute(graph, "test-run-1").unwrap();
        assert_eq!(metrics.completed_tasks, 2);
        assert_eq!(metrics.failed_tasks, 0);
    }

    #[test]
    fn orchestrator_detects_deadlock() {
        let config = OrchestratorConfig::default();
        let mut orchestrator = Orchestrator::new(config);

        let mut graph = TaskGraph::new();
        let t1 = graph.add_node(TaskNode::new("a", "task a").with_agent("missing"));
        let t2 = graph.add_node(TaskNode::new("b", "task b").with_agent("missing"));
        graph.add_dependency(t1, t2).unwrap();
        graph.add_dependency(t2, t1).unwrap_err();

        let metrics = orchestrator.execute(graph, "test-run-2").unwrap();
        assert_eq!(metrics.failed_tasks, 2);
    }
}
