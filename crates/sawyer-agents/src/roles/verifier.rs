//! Verifier agent - validates outputs and ensures correctness.

use crate::roles::agent_role::{AgentRole, AgentId, CostProfile, AgentResult};
use crate::core::task_graph::TaskNode;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationRule {
    pub name: String,
    pub pattern: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifierConfig {
    pub rules: Vec<VerificationRule>,
    pub strict_mode: bool,
}

impl Default for VerifierConfig {
    fn default() -> Self {
        Self {
            rules: vec![
                VerificationRule {
                    name: "non_empty".to_string(),
                    pattern: ".+".to_string(),
                    required: true,
                },
            ],
            strict_mode: false,
        }
    }
}

pub struct VerifierAgent {
    id: String,
    config: VerifierConfig,
}

impl VerifierAgent {
    pub fn new(config: VerifierConfig) -> Self {
        Self {
            id: "verifier".to_string(),
            config,
        }
    }

    pub fn verify_output(&self, expected: &str, actual: &str) -> VerificationResult {
        let mut passed = true;
        let mut failures = Vec::new();

        for rule in &self.config.rules {
            if rule.required && actual.is_empty() {
                passed = false;
                failures.push(format!("rule '{}' violated: output is empty", rule.name));
            }
        }

        if self.config.strict_mode && expected != actual {
            passed = false;
            failures.push("strict mode: output does not match expected".to_string());
        }

        VerificationResult {
            passed,
            failures,
            actual_output: actual.to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct VerificationResult {
    pub passed: bool,
    pub failures: Vec<String>,
    pub actual_output: String,
}

impl AgentRole for VerifierAgent {
    fn id(&self) -> &str {
        &self.id
    }

    fn role_name(&self) -> &str {
        "verifier"
    }

    fn execute(&self, task: &TaskNode) -> AgentResult {
        let output = task.output.as_deref().unwrap_or("");
        let result = self.verify_output("", output);

        if result.passed {
            Ok(format!("verified: {} (all checks passed)", task.label))
        } else {
            Err(format!("verification failed: {}", result.failures.join("; ")))
        }
    }

    fn cost_profile(&self) -> CostProfile {
        CostProfile {
            base_cost_micros: 300,
            per_token_cost_micros: 1,
            max_tokens: 1024,
        }
    }

    fn can_handle(&self, task_type: &str) -> bool {
        matches!(task_type, "verification" | "validation" | "testing" | "quality")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::task_graph::TaskNode;

    #[test]
    fn verifier_passes_valid_output() {
        let verifier = VerifierAgent::new(VerifierConfig::default());
        let mut task = TaskNode::new("check", "verify something");
        task.mark_completed("valid output");

        let result = verifier.execute(&task);
        assert!(result.is_ok());
    }

    #[test]
    fn verifier_fails_empty_output() {
        let verifier = VerifierAgent::new(VerifierConfig::default());
        let mut task = TaskNode::new("check", "verify something");
        task.mark_completed("");

        let result = verifier.execute(&task);
        assert!(result.is_err());
    }

    #[test]
    fn verifier_strict_mode_checks_equality() {
        let verifier = VerifierAgent::new(VerifierConfig {
            rules: vec![],
            strict_mode: true,
        });
        let result = verifier.verify_output("expected", "actual");
        assert!(!result.passed);
    }
}
