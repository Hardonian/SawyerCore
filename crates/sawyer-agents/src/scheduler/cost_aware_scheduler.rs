//! Cost-aware priority scheduler for multi-agent task execution.

use std::collections::HashMap;
use std::time::Instant;

use crate::core::task_graph::{TaskId, TaskNode, TaskPriority, TaskNodeState};
use crate::roles::agent_role::CostProfile;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostBudget {
    pub max_total_micros: u64,
    pub spent_micros: u64,
    pub per_task_cap_micros: u64,
}

impl CostBudget {
    pub fn new(max_total_micros: u64, per_task_cap_micros: u64) -> Self {
        Self {
            max_total_micros,
            spent_micros: 0,
            per_task_cap_micros,
        }
    }

    pub fn remaining(&self) -> u64 {
        self.max_total_micros.saturating_sub(self.spent_micros)
    }

    pub fn can_afford(&self, cost_micros: u64) -> bool {
        cost_micros <= self.remaining() && cost_micros <= self.per_task_cap_micros
    }

    pub fn spend(&mut self, cost_micros: u64) -> Result<(), String> {
        if !self.can_afford(cost_micros) {
            return Err(format!(
                "budget exceeded: need {} micros, have {} remaining, cap {}",
                cost_micros,
                self.remaining(),
                self.per_task_cap_micros
            ));
        }
        self.spent_micros += cost_micros;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulingDecision {
    pub task_id: TaskId,
    pub priority_score: u32,
    pub estimated_cost_micros: u64,
    pub agent_id: String,
    pub deadline: Option<Instant>,
    pub reasoning: String,
}

pub struct CostAwareScheduler {
    budget: CostBudget,
    agent_costs: HashMap<String, CostProfile>,
    task_queue: Vec<TaskId>,
    scheduling_log: Vec<SchedulingDecision>,
}

impl Default for CostAwareScheduler {
    fn default() -> Self {
        Self {
            budget: CostBudget::new(100_000_000, 10_000_000),
            agent_costs: HashMap::new(),
            task_queue: Vec::new(),
            scheduling_log: Vec::new(),
        }
    }
}

impl CostAwareScheduler {
    pub fn with_budget(budget: CostBudget) -> Self {
        Self {
            budget,
            agent_costs: HashMap::new(),
            task_queue: Vec::new(),
            scheduling_log: Vec::new(),
        }
    }

    pub fn register_agent(&mut self, id: &str, profile: CostProfile) {
        self.agent_costs.insert(id.to_string(), profile);
    }

    pub fn enqueue(&mut self, task_id: TaskId) {
        self.task_queue.push(task_id);
    }

    pub fn schedule_next(
        &mut self,
        ready_tasks: Vec<TaskId>,
        nodes: &HashMap<TaskId, TaskNode>,
    ) -> Vec<SchedulingDecision> {
        let mut scored: Vec<(TaskId, u32, u64)> = Vec::new();

        for task_id in ready_tasks {
            if let Some(node) = nodes.get(&task_id) {
                let priority_score = self.compute_priority_score(node);
                let cost = self.estimate_task_cost(node);
                scored.push((task_id, priority_score, cost));
            }
        }

        scored.sort_by(|a, b| {
            b.1.cmp(&a.1)
                .then_with(|| a.2.cmp(&b.2))
        });

        let mut decisions = Vec::new();
        for (task_id, priority_score, cost) in scored {
            if !self.budget.can_afford(cost) {
                continue;
            }

            if let Some(node) = nodes.get(&task_id) {
                let agent = node.assigned_agent.clone().unwrap_or_default();
                let _ = self.budget.spend(cost);

                let decision = SchedulingDecision {
                    task_id,
                    priority_score,
                    estimated_cost_micros: cost,
                    agent_id: agent.clone(),
                    deadline: None,
                    reasoning: format!(
                        "priority={} cost={}μs agent={}",
                        priority_score, cost, agent
                    ),
                };
                decisions.push(decision);
                self.scheduling_log.push(decision.clone());
            }
        }

        decisions
    }

    pub fn compute_priority_score(&self, node: &TaskNode) -> u32 {
        let mut score = node.priority.as_u8() as u32 * 100;

        if node.retry_count > 0 {
            score += node.retry_count as u32 * 50;
        }

        if node.dependencies.is_empty() {
            score += 10;
        }

        if node.tags.contains(&"critical".to_string()) {
            score += 200;
        }

        score
    }

    pub fn estimate_task_cost(&self, node: &TaskNode) -> u64 {
        if let Some(agent) = &node.assigned_agent {
            if let Some(profile) = self.agent_costs.get(agent) {
                return profile.base_cost_micros;
            }
        }

        if node.estimated_cost_micros > 0 {
            return node.estimated_cost_micros;
        }

        1000
    }

    pub fn budget(&self) -> &CostBudget {
        &self.budget
    }

    pub fn budget_mut(&mut self) -> &mut CostBudget {
        &mut self.budget
    }

    pub fn scheduling_log(&self) -> &[SchedulingDecision] {
        &self.scheduling_log
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn budget_tracks_spending() {
        let mut budget = CostBudget::new(1000, 500);
        assert!(budget.can_afford(500));
        assert!(budget.spend(500).is_ok());
        assert!(!budget.can_afford(501));
        assert_eq!(budget.remaining(), 500);
    }

    #[test]
    fn budget_respects_per_task_cap() {
        let mut budget = CostBudget::new(10000, 100);
        assert!(!budget.can_afford(200));
        assert!(budget.spend(200).is_err());
    }

    #[test]
    fn scheduler_prioritizes_critical_tasks() {
        let mut scheduler = CostAwareScheduler::default();

        let mut critical = TaskNode::new("critical", "critical task")
            .with_priority(TaskPriority::Critical);
        critical.id = TaskId(1);

        let mut low = TaskNode::new("low", "low priority task")
            .with_priority(TaskPriority::Low);
        low.id = TaskId(2);

        let mut nodes = HashMap::new();
        nodes.insert(TaskId(1), critical);
        nodes.insert(TaskId(2), low);

        let decisions = scheduler.schedule_next(vec![TaskId(1), TaskId(2)], &nodes);
        assert!(!decisions.is_empty());
        assert!(decisions[0].priority_score > decisions.last().unwrap().priority_score);
    }
}
