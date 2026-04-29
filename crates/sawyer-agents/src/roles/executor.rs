//! Executor agent - performs task execution.

use crate::roles::agent_role::{AgentRole, AgentId, CostProfile, AgentResult};
use crate::core::task_graph::TaskNode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutorConfig {
    pub timeout_ms: u64,
    pub retry_on_failure: bool,
    pub max_output_size: usize,
}

impl Default for ExecutorConfig {
    fn default() -> Self {
        Self {
            timeout_ms: 30_000,
            retry_on_failure: true,
            max_output_size: 65536,
        }
    }
}

pub struct ExecutorAgent {
    id: String,
    config: ExecutorConfig,
}

impl ExecutorAgent {
    pub fn new(config: ExecutorConfig) -> Self {
        Self {
            id: "executor".to_string(),
            config,
        }
    }
}

impl AgentRole for ExecutorAgent {
    fn id(&self) -> &str {
        &self.id
    }

    fn role_name(&self) -> &str {
        "executor"
    }

    fn execute(&self, task: &TaskNode) -> AgentResult {
        let input = task.input.as_deref().unwrap_or("");
        if input.is_empty() && task.description.is_empty() {
            return Err("no input provided for execution".to_string());
        }

        let output = format!("executed: {} (input: {})", task.label, input);
        if output.len() > self.config.max_output_size {
            return Err("output size exceeded".to_string());
        }

        Ok(output)
    }

    fn cost_profile(&self) -> CostProfile {
        CostProfile {
            base_cost_micros: 2000,
            per_token_cost_micros: 2,
            max_tokens: 8192,
        }
    }

    fn can_handle(&self, task_type: &str) -> bool {
        matches!(task_type, "execution" | "computation" | "transformation" | "io")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::task_graph::TaskNode;

    #[test]
    fn executor_runs_task_with_input() {
        let executor = ExecutorAgent::new(ExecutorConfig::default());
        let task = TaskNode::new("compute", "compute something")
            .with_input("data");

        let result = executor.execute(&task);
        assert!(result.is_ok());
    }

    #[test]
    fn executor_fails_without_input() {
        let executor = ExecutorAgent::new(ExecutorConfig::default());
        let task = TaskNode::new("empty", "");

        let result = executor.execute(&task);
        assert!(result.is_err());
    }

    #[test]
    fn executor_handles_correct_task_types() {
        let executor = ExecutorAgent::new(ExecutorConfig::default());
        assert!(executor.can_handle("execution"));
        assert!(executor.can_handle("computation"));
        assert!(!executor.can_handle("planning"));
    }
}
