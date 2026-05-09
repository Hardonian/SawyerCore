use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum PlanStep {
    UseKB,
    Classify,
    Extract,
    Generate,
    Refine,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub steps: Vec<PlanStep>,
    pub depth: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlannerConfig {
    pub long_input_threshold: usize,
    pub max_depth: usize,
    pub max_plan_steps: usize,
}

impl Default for PlannerConfig {
    fn default() -> Self {
        Self {
            long_input_threshold: 256,
            max_depth: 4,
            max_plan_steps: 8,
        }
    }
}

#[derive(Debug, Clone)]
pub struct Planner {
    config: PlannerConfig,
}

impl Planner {
    pub fn new(config: PlannerConfig) -> Self {
        Self { config }
    }

    pub fn create_plan(&self, input: &str, kb_hit: bool) -> Plan {
        let mut steps = Vec::with_capacity(5);
        if kb_hit {
            steps.push(PlanStep::UseKB);
            return Plan { steps, depth: 1 };
        }

        steps.push(PlanStep::Classify);
        steps.push(PlanStep::Extract);
        steps.push(PlanStep::Generate);

        if input.chars().count() >= self.config.long_input_threshold {
            steps.push(PlanStep::Refine);
        }

        if steps.len() > self.config.max_plan_steps {
            steps.truncate(self.config.max_plan_steps);
        }
        let depth = steps.len().min(self.config.max_depth);
        Plan { steps, depth }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deterministic_plan_for_same_input() {
        let planner = Planner::new(PlannerConfig::default());
        let p1 = planner.create_plan("hello world", false);
        let p2 = planner.create_plan("hello world", false);
        assert_eq!(p1.steps, p2.steps);
        assert_eq!(p1.depth, p2.depth);
    }

    #[test]
    fn kb_hit_short_circuit() {
        let planner = Planner::new(PlannerConfig::default());
        let p = planner.create_plan("ignored", true);
        assert_eq!(p.steps, vec![PlanStep::UseKB]);
    }

    #[test]
    fn long_input_adds_refine() {
        let planner = Planner::new(PlannerConfig {
            long_input_threshold: 10,
            ..PlannerConfig::default()
        });
        let p = planner.create_plan("this is definitely long", false);
        assert!(p.steps.contains(&PlanStep::Refine));
    }
}
