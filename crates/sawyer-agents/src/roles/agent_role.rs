//! Agent role trait and common types.

use std::collections::HashMap;

use crate::core::task_graph::TaskNode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AgentId(pub String);

impl AgentId {
    pub fn new(id: &str) -> Self {
        Self(id.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostProfile {
    pub base_cost_micros: u64,
    pub per_token_cost_micros: u64,
    pub max_tokens: u32,
}

impl Default for CostProfile {
    fn default() -> Self {
        Self {
            base_cost_micros: 1000,
            per_token_cost_micros: 1,
            max_tokens: 4096,
        }
    }
}

pub type AgentResult = Result<String, String>;

pub trait AgentRole: Send + Sync {
    fn id(&self) -> &str;
    fn role_name(&self) -> &str;
    fn execute(&self, task: &TaskNode) -> AgentResult;
    fn cost_profile(&self) -> CostProfile;
    fn can_handle(&self, task_type: &str) -> bool;
}

#[cfg(test)]
pub struct MockAgent {
    id: String,
    output: String,
    cost_profile: CostProfile,
}

#[cfg(test)]
impl MockAgent {
    pub fn new(id: &str, output: &str) -> Self {
        Self {
            id: id.to_string(),
            output: output.to_string(),
            cost_profile: CostProfile::default(),
        }
    }
}

#[cfg(test)]
impl AgentRole for MockAgent {
    fn id(&self) -> &str {
        &self.id
    }

    fn role_name(&self) -> &str {
        &self.id
    }

    fn execute(&self, _task: &TaskNode) -> AgentResult {
        Ok(self.output.clone())
    }

    fn cost_profile(&self) -> CostProfile {
        self.cost_profile.clone()
    }

    fn can_handle(&self, _task_type: &str) -> bool {
        true
    }
}
