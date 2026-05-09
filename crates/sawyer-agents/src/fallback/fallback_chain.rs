//! Fallback system with graceful degradation tiers.

use crate::core::task_graph::TaskNode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FallbackTier {
    Tier1LocalRetry,
    Tier2AlternativeAgent,
    Tier3SimplifiedOutput,
    Tier4CachedResult,
    Tier5StaticFallback,
}

impl FallbackTier {
    pub fn level(&self) -> u32 {
        match self {
            FallbackTier::Tier1LocalRetry => 1,
            FallbackTier::Tier2AlternativeAgent => 2,
            FallbackTier::Tier3SimplifiedOutput => 3,
            FallbackTier::Tier4CachedResult => 4,
            FallbackTier::Tier5StaticFallback => 5,
        }
    }
}

#[derive(Debug, Clone)]
pub enum FallbackResult {
    Success(String, u32),
    Degraded(String, u32),
    Failed(String),
}

pub struct FallbackTierConfig {
    pub tier: FallbackTier,
    pub enabled: bool,
    pub max_attempts: u32,
}

impl Default for FallbackTierConfig {
    fn default() -> Self {
        Self {
            tier: FallbackTier::Tier1LocalRetry,
            enabled: true,
            max_attempts: 2,
        }
    }
}

pub struct FallbackChain {
    tiers: Vec<FallbackTierConfig>,
    cache: Vec<(String, String)>,
}

impl FallbackChain {
    pub fn new() -> Self {
        Self {
            tiers: vec![
                FallbackTierConfig {
                    tier: FallbackTier::Tier1LocalRetry,
                    enabled: true,
                    max_attempts: 2,
                },
                FallbackTierConfig {
                    tier: FallbackTier::Tier2AlternativeAgent,
                    enabled: true,
                    max_attempts: 1,
                },
                FallbackTierConfig {
                    tier: FallbackTier::Tier3SimplifiedOutput,
                    enabled: true,
                    max_attempts: 1,
                },
                FallbackTierConfig {
                    tier: FallbackTier::Tier4CachedResult,
                    enabled: true,
                    max_attempts: 1,
                },
                FallbackTierConfig {
                    tier: FallbackTier::Tier5StaticFallback,
                    enabled: true,
                    max_attempts: 1,
                },
            ],
            cache: Vec::new(),
        }
    }

    pub fn with_tiers(tiers: Vec<FallbackTierConfig>) -> Self {
        Self {
            tiers,
            cache: Vec::new(),
        }
    }

    pub fn add_to_cache(&mut self, task_label: &str, output: &str) {
        self.cache.push((task_label.to_string(), output.to_string()));
    }

    pub fn execute(&self, task: &TaskNode, original_error: &str) -> FallbackResult {
        let _ = original_error;

        for config in &self.tiers {
            if !config.enabled {
                continue;
            }

            match config.tier {
                FallbackTier::Tier1LocalRetry => {
                    if task.retry_count < config.max_attempts {
                        return FallbackResult::Success(
                            format!("retry attempt {} for {}", task.retry_count + 1, task.label),
                            config.tier.level(),
                        );
                    }
                }
                FallbackTier::Tier2AlternativeAgent => {
                    if let Some(alt) = Self::find_alternative_agent(task) {
                        return FallbackResult::Degraded(
                            format!("fallback to alternative agent: {} (output may be suboptimal)", alt),
                            config.tier.level(),
                        );
                    }
                }
                FallbackTier::Tier3SimplifiedOutput => {
                    return FallbackResult::Degraded(
                        format!("simplified output for task: {} (degraded mode)", task.label),
                        config.tier.level(),
                    );
                }
                FallbackTier::Tier4CachedResult => {
                    if let Some(cached) = self.cache.iter().find(|(label, _)| label == &task.label) {
                        return FallbackResult::Degraded(
                            format!("cached result: {} (may be stale)", cached.1),
                            config.tier.level(),
                        );
                    }
                }
                FallbackTier::Tier5StaticFallback => {
                    return FallbackResult::Degraded(
                        format!("static fallback: task '{}' could not be completed, marking as degraded", task.label),
                        config.tier.level(),
                    );
                }
            }
        }

        FallbackResult::Failed("all fallback tiers exhausted".to_string())
    }

    fn find_alternative_agent(task: &TaskNode) -> Option<String> {
        let current = task.assigned_agent.as_deref().unwrap_or("");
        let alternatives = match current {
            "planner" => Some("executor"),
            "executor" => Some("planner"),
            "verifier" => Some("optimizer"),
            "optimizer" => Some("verifier"),
            _ => None,
        };
        alternatives.map(String::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::task_graph::TaskNode;

    #[test]
    fn fallback_chain_executes_tiers_in_order() {
        let chain = FallbackChain::new();
        let task = TaskNode::new("test", "test task")
            .with_agent("planner");

        let result = chain.execute(&task, "original error");
        match result {
            FallbackResult::Success(_, tier) => assert_eq!(tier, 1),
            _ => panic!("expected Tier1 retry result"),
        }
    }

    #[test]
    fn fallback_chain_degrades_gracefully() {
        let chain = FallbackChain::new();
        let mut task = TaskNode::new("test", "test task")
            .with_agent("planner");
        task.retry_count = 5;

        let result = chain.execute(&task, "original error");
        match result {
            FallbackResult::Degraded(_, tier) => assert!(tier >= 2),
            _ => panic!("expected degraded result"),
        }
    }

    #[test]
    fn fallback_chain_uses_cache() {
        let mut chain = FallbackChain::new();
        chain.add_to_cache("cached_task", "cached output");
        let mut task = TaskNode::new("cached_task", "cached task")
            .with_agent("planner");
        task.retry_count = 5;

        let result = chain.execute(&task, "original error");
        match result {
            FallbackResult::Degraded(msg, tier) => {
                assert!(msg.contains("cached"));
                assert_eq!(tier, 4);
            }
            _ => panic!("expected cached degraded result"),
        }
    }

    #[test]
    fn fallback_tier_levels_are_sequential() {
        assert_eq!(FallbackTier::Tier1LocalRetry.level(), 1);
        assert_eq!(FallbackTier::Tier2AlternativeAgent.level(), 2);
        assert_eq!(FallbackTier::Tier3SimplifiedOutput.level(), 3);
        assert_eq!(FallbackTier::Tier4CachedResult.level(), 4);
        assert_eq!(FallbackTier::Tier5StaticFallback.level(), 5);
    }
}
