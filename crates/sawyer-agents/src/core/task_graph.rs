//! Task graph definitions for multi-agent execution.

use std::collections::{HashMap, HashSet, VecDeque};
use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use serde::{Deserialize, Serialize};

static NEXT_TASK_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct TaskId(pub u64);

impl TaskId {
    pub fn new() -> Self {
        Self(NEXT_TASK_ID.fetch_add(1, Ordering::SeqCst))
    }
}

impl Default for TaskId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Display for TaskId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "task-{}", self.0)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskPriority {
    Critical,
    High,
    Normal,
    Low,
}

impl TaskPriority {
    pub fn as_u8(&self) -> u8 {
        match self {
            TaskPriority::Critical => 4,
            TaskPriority::High => 3,
            TaskPriority::Normal => 2,
            TaskPriority::Low => 1,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskNodeState {
    Pending,
    Scheduled,
    Running,
    Completed,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskNode {
    pub id: TaskId,
    pub label: String,
    pub description: String,
    pub assigned_agent: Option<String>,
    pub priority: TaskPriority,
    pub estimated_cost_micros: u64,
    pub max_retries: u32,
    pub retry_count: u32,
    pub state: TaskNodeState,
    pub dependencies: Vec<TaskId>,
    pub dependents: Vec<TaskId>,
    pub input: Option<String>,
    pub output: Option<String>,
    pub error: Option<String>,
    pub created_at: Instant,
    pub started_at: Option<Instant>,
    pub completed_at: Option<Instant>,
    pub tags: Vec<String>,
}

impl TaskNode {
    pub fn new(label: &str, description: &str) -> Self {
        Self {
            id: TaskId::new(),
            label: label.to_string(),
            description: description.to_string(),
            assigned_agent: None,
            priority: TaskPriority::Normal,
            estimated_cost_micros: 0,
            max_retries: 3,
            retry_count: 0,
            state: TaskNodeState::Pending,
            dependencies: Vec::new(),
            dependents: Vec::new(),
            input: None,
            output: None,
            error: None,
            created_at: Instant::now(),
            started_at: None,
            completed_at: None,
            tags: Vec::new(),
        }
    }

    pub fn with_priority(mut self, priority: TaskPriority) -> Self {
        self.priority = priority;
        self
    }

    pub fn with_cost(mut self, cost_micros: u64) -> Self {
        self.estimated_cost_micros = cost_micros;
        self
    }

    pub fn with_agent(mut self, agent: &str) -> Self {
        self.assigned_agent = Some(agent.to_string());
        self
    }

    pub fn with_max_retries(mut self, retries: u32) -> Self {
        self.max_retries = retries;
        self
    }

    pub fn with_input(mut self, input: &str) -> Self {
        self.input = Some(input.to_string());
        self
    }

    pub fn with_tags(mut self, tags: Vec<&str>) -> Self {
        self.tags = tags.into_iter().map(String::from).collect();
        self
    }

    pub fn is_ready(&self, completed: &HashSet<TaskId>) -> bool {
        self.dependencies.iter().all(|dep| completed.contains(dep))
    }

    pub fn can_retry(&self) -> bool {
        self.retry_count < self.max_retries
    }

    pub fn mark_scheduled(&mut self) {
        self.state = TaskNodeState::Scheduled;
    }

    pub fn mark_running(&mut self) {
        self.state = TaskNodeState::Running;
        self.started_at = Some(Instant::now());
    }

    pub fn mark_completed(&mut self, output: &str) {
        self.state = TaskNodeState::Completed;
        self.output = Some(output.to_string());
        self.completed_at = Some(Instant::now());
    }

    pub fn mark_failed(&mut self, error: &str) {
        self.state = TaskNodeState::Failed;
        self.error = Some(error.to_string());
        self.completed_at = Some(Instant::now());
    }

    pub fn mark_skipped(&mut self) {
        self.state = TaskNodeState::Skipped;
        self.completed_at = Some(Instant::now());
    }

    pub fn retry(&mut self) {
        self.retry_count += 1;
        self.state = TaskNodeState::Pending;
        self.error = None;
        self.started_at = None;
        self.completed_at = None;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskGraph {
    pub nodes: HashMap<TaskId, TaskNode>,
    pub entry_points: Vec<TaskId>,
    pub root_id: Option<TaskId>,
}

impl TaskGraph {
    pub fn new() -> Self {
        Self {
            nodes: HashMap::new(),
            entry_points: Vec::new(),
            root_id: None,
        }
    }

    pub fn add_node(&mut self, node: TaskNode) -> TaskId {
        let id = node.id;
        if self.nodes.is_empty() {
            self.root_id = Some(id);
        }
        if node.dependencies.is_empty() {
            self.entry_points.push(id);
        }
        self.nodes.insert(id, node);
        id
    }

    pub fn add_dependency(&mut self, from: TaskId, to: TaskId) -> Result<(), String> {
        if !self.nodes.contains_key(&from) {
            return Err(format!("source task {} not found", from));
        }
        if !self.nodes.contains_key(&to) {
            return Err(format!("target task {} not found", to));
        }

        if self.would_create_cycle(from, to) {
            return Err(format!("adding dependency {} -> {} would create cycle", from, to));
        }

        if let Some(node) = self.nodes.get_mut(&from) {
            if !node.dependents.contains(&to) {
                node.dependents.push(to);
            }
        }
        if let Some(node) = self.nodes.get_mut(&to) {
            if !node.dependencies.contains(&from) {
                node.dependencies.push(from);
            }
            let idx = self.entry_points.iter().position(|&e| e == to);
            if let Some(idx) = idx {
                self.entry_points.remove(idx);
            }
        }

        Ok(())
    }

    fn would_create_cycle(&self, from: TaskId, to: TaskId) -> bool {
        if from == to {
            return true;
        }
        let mut visited = HashSet::new();
        let mut queue = VecDeque::new();
        queue.push_back(to);

        while let Some(current) = queue.pop_front() {
            if current == from {
                return true;
            }
            if visited.contains(&current) {
                continue;
            }
            visited.insert(current);

            if let Some(node) = self.nodes.get(&current) {
                for &dep in &node.dependencies {
                    queue.push_back(dep);
                }
            }
        }
        false
    }

    pub fn ready_tasks(&self, completed: &HashSet<TaskId>) -> Vec<TaskId> {
        self.nodes
            .values()
            .filter(|node| {
                node.state == TaskNodeState::Pending && node.is_ready(completed)
            })
            .map(|node| node.id)
            .collect()
    }

    pub fn get_node(&self, id: &TaskId) -> Option<&TaskNode> {
        self.nodes.get(id)
    }

    pub fn get_node_mut(&mut self, id: &TaskId) -> Option<&mut TaskNode> {
        self.nodes.get_mut(id)
    }

    pub fn all_completed(&self) -> bool {
        self.nodes.values().all(|n| {
            n.state == TaskNodeState::Completed || n.state == TaskNodeState::Skipped
        })
    }

    pub fn has_failed(&self) -> bool {
        self.nodes.values().any(|n| n.state == TaskNodeState::Failed)
    }

    pub fn completion_stats(&self) -> GraphStats {
        let mut completed = 0;
        let mut failed = 0;
        let mut pending = 0;
        let mut running = 0;
        let mut skipped = 0;
        let mut total_cost = 0u64;

        for node in self.nodes.values() {
            match node.state {
                TaskNodeState::Completed => completed += 1,
                TaskNodeState::Failed => failed += 1,
                TaskNodeState::Pending => pending += 1,
                TaskNodeState::Running => running += 1,
                TaskNodeState::Scheduled => pending += 1,
                TaskNodeState::Skipped => skipped += 1,
            }
            if let Some(_) = node.completed_at {
                total_cost += node.estimated_cost_micros;
            }
        }

        GraphStats {
            total: self.nodes.len(),
            completed,
            failed,
            pending,
            running,
            skipped,
            total_cost_micros: total_cost,
        }
    }

    pub fn execution_order(&self) -> Vec<Vec<TaskId>> {
        let mut levels: Vec<Vec<TaskId>> = Vec::new();
        let mut completed = HashSet::new();
        let mut remaining: HashSet<TaskId> = self.nodes.keys().cloned().collect();

        while !remaining.is_empty() {
            let ready: Vec<TaskId> = remaining
                .iter()
                .filter(|&id| {
                    if let Some(node) = self.nodes.get(id) {
                        node.dependencies.iter().all(|d| completed.contains(d))
                    } else {
                        false
                    }
                })
                .cloned()
                .collect();

            if ready.is_empty() {
                break;
            }

            for id in &ready {
                remaining.remove(id);
                completed.insert(*id);
            }
            levels.push(ready);
        }

        levels
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphStats {
    pub total: usize,
    pub completed: usize,
    pub failed: usize,
    pub pending: usize,
    pub running: usize,
    pub skipped: usize,
    pub total_cost_micros: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_graph_detects_cycles() {
        let mut graph = TaskGraph::new();
        let a = graph.add_node(TaskNode::new("a", "task a"));
        let b = graph.add_node(TaskNode::new("b", "task b"));
        let c = graph.add_node(TaskNode::new("c", "task c"));

        assert!(graph.add_dependency(a, b).is_ok());
        assert!(graph.add_dependency(b, c).is_ok());
        assert!(graph.add_dependency(c, a).is_err());
    }

    #[test]
    fn task_graph_ready_tasks_returns_independent_nodes() {
        let mut graph = TaskGraph::new();
        let a = graph.add_node(TaskNode::new("a", "task a"));
        let b = graph.add_node(TaskNode::new("b", "task b"));
        let _c = graph.add_node(TaskNode::new("c", "task c").with_tags(vec!["dep"]));

        graph.add_dependency(a, _c).unwrap();
        graph.add_dependency(b, _c).unwrap();

        let completed = HashSet::new();
        let ready = graph.ready_tasks(&completed);
        assert_eq!(ready.len(), 2);
        assert!(ready.contains(&a));
        assert!(ready.contains(&b));
        assert!(!ready.contains(&_c));
    }

    #[test]
    fn task_graph_execution_order_respects_dependencies() {
        let mut graph = TaskGraph::new();
        let a = graph.add_node(TaskNode::new("a", "task a"));
        let b = graph.add_node(TaskNode::new("b", "task b"));
        let c = graph.add_node(TaskNode::new("c", "task c"));

        graph.add_dependency(a, c).unwrap();
        graph.add_dependency(b, c).unwrap();

        let order = graph.execution_order();
        assert_eq!(order.len(), 2);

        let first_level: HashSet<TaskId> = order[0].iter().cloned().collect();
        assert!(first_level.contains(&a));
        assert!(first_level.contains(&b));
        assert_eq!(order[1], vec![c]);
    }

    #[test]
    fn task_node_retry_logic() {
        let mut node = TaskNode::new("test", "test task").with_max_retries(2);
        assert!(node.can_retry());

        node.mark_failed("error");
        node.retry();
        assert_eq!(node.retry_count, 1);
        assert!(node.can_retry());
        assert_eq!(node.state, TaskNodeState::Pending);

        node.mark_failed("error2");
        node.retry();
        assert_eq!(node.retry_count, 2);
        assert!(!node.can_retry());
    }
}
