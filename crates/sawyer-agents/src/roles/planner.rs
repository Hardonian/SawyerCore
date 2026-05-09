//! Planner agent - decomposes goals into task graphs.

use crate::core::task_graph::{TaskGraph, TaskNode, TaskPriority, TaskId};
use crate::roles::agent_role::{AgentRole, AgentId, CostProfile, AgentResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannerConfig {
    pub max_subtasks: usize,
    pub default_priority: TaskPriority,
    pub enable_parallelism: bool,
}

impl Default for PlannerConfig {
    fn default() -> Self {
        Self {
            max_subtasks: 20,
            default_priority: TaskPriority::Normal,
            enable_parallelism: true,
        }
    }
}

pub struct PlannerAgent {
    id: String,
    config: PlannerConfig,
}

impl PlannerAgent {
    pub fn new(config: PlannerConfig) -> Self {
        Self {
            id: "planner".to_string(),
            config,
        }
    }

    pub fn decompose_goal(&self, goal: &str, context: &str) -> TaskGraph {
        let mut graph = TaskGraph::new();

        let analyze = graph.add_node(
            TaskNode::new("analyze", "analyze goal and context")
                .with_agent("planner")
                .with_priority(TaskPriority::Critical)
                .with_input(&format!("goal: {}\ncontext: {}", goal, context)),
        );

        let strategy = graph.add_node(
            TaskNode::new("strategy", "devise execution strategy")
                .with_agent("planner")
                .with_priority(TaskPriority::High),
        );

        let validate = graph.add_node(
            TaskNode::new("validate_plan", "validate plan feasibility")
                .with_agent("planner")
                .with_priority(TaskPriority::High),
        );

        graph.add_dependency(analyze, strategy).ok();
        graph.add_dependency(strategy, validate).ok();

        if self.config.enable_parallelism {
            let exec_prep = graph.add_node(
                TaskNode::new("prepare_execution", "prepare execution environment")
                    .with_agent("executor")
                    .with_priority(TaskPriority::Normal),
            );
            graph.add_dependency(validate, exec_prep).ok();
        }

        graph
    }
}

impl AgentRole for PlannerAgent {
    fn id(&self) -> &str {
        &self.id
    }

    fn role_name(&self) -> &str {
        "planner"
    }

    fn execute(&self, task: &TaskNode) -> AgentResult {
        match task.label.as_str() {
            "analyze" => {
                let input = task.input.as_deref().unwrap_or("");
                Ok(format!("analysis complete: {}", input))
            }
            "strategy" => Ok("strategy devised: sequential execution with parallel validation".to_string()),
            "validate_plan" => Ok("plan validated: feasible within cost constraints".to_string()),
            "prepare_execution" => Ok("execution environment prepared".to_string()),
            _ => Ok(format!("planned: {}", task.label)),
        }
    }

    fn cost_profile(&self) -> CostProfile {
        CostProfile {
            base_cost_micros: 500,
            per_token_cost_micros: 1,
            max_tokens: 2048,
        }
    }

    fn can_handle(&self, task_type: &str) -> bool {
        matches!(task_type, "planning" | "analysis" | "strategy" | "decomposition")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn planner_decomposes_goal_into_graph() {
        let planner = PlannerAgent::new(PlannerConfig::default());
        let graph = planner.decompose_goal("build feature X", "existing codebase");

        assert!(!graph.nodes.is_empty());
        assert_eq!(graph.entry_points.len(), 1);
        assert!(graph.execution_order().len() >= 3);
    }

    #[test]
    fn planner_handles_task_types() {
        let planner = PlannerAgent::new(PlannerConfig::default());
        assert!(planner.can_handle("planning"));
        assert!(planner.can_handle("analysis"));
        assert!(!planner.can_handle("execution"));
    }
}
