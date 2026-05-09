//! Runtime primitives for SawyerCore.

use std::collections::VecDeque;
use std::path::Path;
use std::time::{Duration, Instant};

use sawyer_history::{AdaptiveConfig, HistoryIndex, ScoreBreakdown};
use sawyer_kb::{KBStore, Scope};
use sawyer_kernels::{detect_cpu_features, CpuFeatures};
use sawyer_llm::{AdapterError, ChatMessage, ChatRequest, ChatResponse, LocalAdapter};
use sawyer_memory::Arena;
use sawyer_planner::{PlanStep, Planner, PlannerConfig};
use sawyer_scheduler::Scheduler;
use sawyer_telemetry::RequestTelemetry;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub step_ns: u64,
    pub arena_capacity: usize,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            step_ns: 1_000_000,
            arena_capacity: 1024 * 1024,
        }
    }
}

pub struct DeterministicRuntime {
    scheduler: Scheduler,
    arena: Arena,
    cpu: CpuFeatures,
}

impl DeterministicRuntime {
    pub fn new(config: RuntimeConfig) -> Self {
        Self {
            scheduler: Scheduler::new(config.step_ns),
            arena: Arena::with_capacity(config.arena_capacity),
            cpu: detect_cpu_features(),
        }
    }

    pub fn step(&mut self) {
        self.scheduler.step();
    }

    pub fn reset_memory(&mut self) {
        self.arena.reset();
    }

    pub fn cpu_features(&self) -> CpuFeatures {
        self.cpu
    }

    pub fn tick(&self) -> u64 {
        self.scheduler.tick()
    }
}

pub struct AdaptiveRoutingEngine {
    config: AdaptiveConfig,
    history: HistoryIndex,
}

impl AdaptiveRoutingEngine {
    pub fn new(config: AdaptiveConfig) -> Self {
        Self {
            history: HistoryIndex::new(config.adaptive_window_size),
            config,
        }
    }

    pub fn record(&mut self, request: RequestTelemetry) {
        self.history.push(request);
    }

    #[allow(clippy::too_many_arguments)]
    pub fn score_candidate(
        &self,
        provider: &str,
        task_type: &str,
        base_score: i32,
        now_ms: u64,
        is_cloud: bool,
        estimated_cost_micros: u64,
        unhealthy: bool,
    ) -> ScoreBreakdown {
        self.history.score_provider(
            &self.config,
            provider,
            task_type,
            base_score,
            now_ms,
            is_cloud,
            estimated_cost_micros,
            unhealthy,
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextBudgetGuard {
    pub max_input_size: usize,
    pub chunk_threshold: usize,
    pub reject_threshold: usize,
}

impl Default for ContextBudgetGuard {
    fn default() -> Self {
        Self {
            max_input_size: 8_192,
            chunk_threshold: 256,
            reject_threshold: 1_024,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionLimits {
    pub max_recursion_depth: usize,
    pub max_plan_steps: usize,
    pub max_model_calls_per_request: usize,
    pub max_cpu_time_ms: u64,
    pub memory_budget_mb: u64,
}

impl Default for ExecutionLimits {
    fn default() -> Self {
        Self {
            max_recursion_depth: 4,
            max_plan_steps: 8,
            max_model_calls_per_request: 1,
            max_cpu_time_ms: 500,
            memory_budget_mb: 512,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplainRecord {
    pub kb_used: bool,
    pub planner_steps: Vec<PlanStep>,
    pub model_used: bool,
    pub model_reason: String,
    pub context_reduction: Option<String>,
    pub resource_decision: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeStats {
    pub requests: u64,
    pub kb_hits: u64,
    pub model_calls: u64,
    pub avg_latency_ms: f64,
}

#[derive(Debug, Clone, Default)]
pub struct EdgeRuntimeConfig {
    pub planner: PlannerConfig,
    pub context: ContextBudgetGuard,
    pub limits: ExecutionLimits,
}

pub struct EdgeIntelligenceLayer {
    kb: KBStore,
    planner: Planner,
    config: EdgeRuntimeConfig,
    last_explain: Option<ExplainRecord>,
    rolling_latency_ms: VecDeque<u64>,
    requests: u64,
    kb_hits: u64,
    model_calls: u64,
}

impl EdgeIntelligenceLayer {
    pub fn from_jsonl(path: impl AsRef<Path>, config: EdgeRuntimeConfig) -> std::io::Result<Self> {
        Ok(Self {
            kb: KBStore::with_jsonl(path)?,
            planner: Planner::new(config.planner.clone()),
            config,
            last_explain: None,
            rolling_latency_ms: VecDeque::with_capacity(64),
            requests: 0,
            kb_hits: 0,
            model_calls: 0,
        })
    }

    pub fn kb(&self) -> &KBStore {
        &self.kb
    }

    pub fn kb_mut(&mut self) -> &mut KBStore {
        &mut self.kb
    }

    pub fn explain_last(&self) -> Option<&ExplainRecord> {
        self.last_explain.as_ref()
    }

    pub fn stats(&self) -> RuntimeStats {
        let avg_latency_ms = if self.rolling_latency_ms.is_empty() {
            0.0
        } else {
            self.rolling_latency_ms.iter().sum::<u64>() as f64
                / self.rolling_latency_ms.len() as f64
        };
        RuntimeStats {
            requests: self.requests,
            kb_hits: self.kb_hits,
            model_calls: self.model_calls,
            avg_latency_ms,
        }
    }

    pub fn execute(
        &mut self,
        model: &str,
        messages: &[ChatMessage],
        adapter: &dyn LocalAdapter,
    ) -> Result<ChatResponse, String> {
        let started = Instant::now();
        self.requests += 1;

        let input = messages
            .iter()
            .map(|m| m.content.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        let tokens = token_count(&input);
        if tokens > self.config.context.max_input_size {
            return Err("reject: max input size exceeded".to_string());
        }

        let kb_hit = self.kb.get(&input).or_else(|| self.kb.fuzzy_get(&input));
        let plan = self.planner.create_plan(&input, kb_hit.is_some());

        if plan.depth > self.config.limits.max_recursion_depth {
            return Err("reject: recursion depth limit exceeded".to_string());
        }
        if plan.steps.len() > self.config.limits.max_plan_steps {
            return Err("reject: max plan steps exceeded".to_string());
        }

        if let Some(var) = kb_hit {
            self.kb_hits += 1;
            let response = ChatResponse {
                id: "kb-hit".to_string(),
                object: "chat.completion".to_string(),
                model: "kb".to_string(),
                degraded: false,
                message: var.value.to_string(),
            };
            self.last_explain = Some(ExplainRecord {
                kb_used: true,
                planner_steps: plan.steps,
                model_used: false,
                model_reason: "kb hit immediate return".to_string(),
                context_reduction: None,
                resource_decision: "allow".to_string(),
            });
            self.record_latency(started.elapsed());
            return Ok(response);
        }

        let context_reduction = if tokens > self.config.context.reject_threshold {
            return Err("reject: input too large for deterministic processing".to_string());
        } else if tokens > self.config.context.chunk_threshold {
            Some("chunk+summarize".to_string())
        } else {
            None
        };

        let mem_cost_mb = estimate_memory_mb(tokens);
        let cpu_load = estimate_cpu_load(tokens);
        let resource_decision = if mem_cost_mb > self.config.limits.memory_budget_mb {
            "degrade: smaller model"
        } else if cpu_load > 90 {
            "degrade: chunking"
        } else {
            "allow"
        }
        .to_string();

        if self.model_calls >= self.config.limits.max_model_calls_per_request as u64 {
            return Err("reject: max model calls per request exceeded".to_string());
        }

        let selected_model = select_quantized_model(model, self.config.limits.memory_budget_mb);
        let req = ChatRequest {
            model: selected_model.to_string(),
            messages: messages.to_vec(),
        };

        let model_result = adapter.chat(req).map_err(|e| match e {
            AdapterError::Unavailable(name) => format!("model unavailable: {name}"),
        })?;

        self.model_calls += 1;
        if started.elapsed() > Duration::from_millis(self.config.limits.max_cpu_time_ms) {
            return Err("reject: cpu time limit exceeded".to_string());
        }

        if let Some(last_user) = messages.last() {
            let _ = self.kb.set(
                &last_user.content,
                json!(model_result.message),
                Scope::Session,
                0.6,
            );
        }

        self.last_explain = Some(ExplainRecord {
            kb_used: false,
            planner_steps: plan.steps,
            model_used: true,
            model_reason: "no kb hit after classify/extract/generate".to_string(),
            context_reduction,
            resource_decision,
        });
        self.record_latency(started.elapsed());
        Ok(model_result)
    }

    fn record_latency(&mut self, latency: Duration) {
        if self.rolling_latency_ms.len() == 64 {
            let _ = self.rolling_latency_ms.pop_front();
        }
        self.rolling_latency_ms
            .push_back(latency.as_millis() as u64);
    }
}

fn token_count(s: &str) -> usize {
    s.split_whitespace().count()
}

fn estimate_memory_mb(tokens: usize) -> u64 {
    ((tokens as u64) / 128).max(1)
}

fn estimate_cpu_load(tokens: usize) -> u64 {
    ((tokens as u64) / 16).min(100)
}

fn select_quantized_model(requested: &str, memory_budget_mb: u64) -> &'static str {
    let _ = requested;
    if memory_budget_mb < 256 {
        "Q4_K_M"
    } else if memory_budget_mb < 1024 {
        "Q5_K_M"
    } else {
        "Q8_0"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sawyer_llm::{ChatRequest, LocalAdapter};

    struct DummyAdapter;
    impl LocalAdapter for DummyAdapter {
        fn chat(&self, request: ChatRequest) -> Result<ChatResponse, AdapterError> {
            Ok(ChatResponse {
                id: "1".to_string(),
                object: "chat.completion".to_string(),
                model: request.model,
                degraded: false,
                message: "generated".to_string(),
            })
        }
    }

    #[test]
    fn kb_hit_avoids_model_call() {
        let path = std::env::temp_dir().join(format!("edge-{}.jsonl", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let mut edge =
            EdgeIntelligenceLayer::from_jsonl(&path, EdgeRuntimeConfig::default()).expect("edge");
        edge.kb_mut()
            .set_with_timestamp("hi", json!("hello"), Scope::Global, 0.9, 1);

        let result = edge.execute(
            "local",
            &[ChatMessage {
                role: "user".into(),
                content: "hi".into(),
            }],
            &DummyAdapter,
        );
        let _ = std::fs::remove_file(&path);
        assert!(result.is_ok());
        assert_eq!(edge.stats().model_calls, 0);
    }

    #[test]
    fn context_guard_rejects_large_input() {
        let path = std::env::temp_dir().join(format!("edge-{}.jsonl", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let mut edge =
            EdgeIntelligenceLayer::from_jsonl(&path, EdgeRuntimeConfig::default()).expect("edge");
        let huge = "x ".repeat(9000);
        let out = edge.execute(
            "local",
            &[ChatMessage {
                role: "user".into(),
                content: huge,
            }],
            &DummyAdapter,
        );
        let _ = std::fs::remove_file(&path);
        assert!(out.is_err());
    }
}
