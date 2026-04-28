//! Deterministic adaptive history, profiling, and explainability.

use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap, VecDeque};

use sawyer_telemetry::{DeviceProfileSnapshot, RequestTelemetry};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdaptiveConfig {
    pub enable_adaptive_routing: bool,
    pub adaptive_window_size: usize,
    pub adaptive_confidence_threshold: f64,
    pub private_mode: bool,
    pub cost_cap_usd_micros: u64,
}

impl Default for AdaptiveConfig {
    fn default() -> Self {
        Self {
            enable_adaptive_routing: true,
            adaptive_window_size: 100,
            adaptive_confidence_threshold: 0.7,
            private_mode: true,
            cost_cap_usd_micros: 50_000,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderMetrics {
    pub avg_latency_ms: u64,
    pub p50_latency_ms: u64,
    pub p95_latency_ms: u64,
    pub success_rate: f64,
    pub failure_rate: f64,
    pub timeout_rate: f64,
    pub throughput_rps: f64,
    pub samples: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskTypeSummary {
    pub best_provider: String,
    pub worst_provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScoreBreakdown {
    pub provider: String,
    pub base_score: i32,
    pub telemetry_adjustment: i32,
    pub final_score: i32,
    pub reason_codes: Vec<String>,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExplainAdaptive {
    pub changed: bool,
    pub what_changed: String,
    pub why: String,
    pub telemetry_basis: String,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceProfile {
    pub device_hash: String,
    pub preferred_providers: Vec<String>,
    pub provider_failures: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailureState {
    pub consecutive_failures: usize,
    pub blacklisted_until_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreloadDecision {
    pub preload: Vec<String>,
    pub unload: Vec<String>,
    pub reason: String,
}

pub struct HistoryIndex {
    window: VecDeque<RequestTelemetry>,
    max_window: usize,
    failures: HashMap<String, FailureState>,
}

impl HistoryIndex {
    pub fn new(max_window: usize) -> Self {
        Self {
            window: VecDeque::with_capacity(max_window),
            max_window,
            failures: HashMap::new(),
        }
    }

    pub fn push(&mut self, request: RequestTelemetry) {
        if !request.success {
            let state = self
                .failures
                .entry(request.selected_provider.clone())
                .or_insert(FailureState {
                    consecutive_failures: 0,
                    blacklisted_until_ms: 0,
                });
            state.consecutive_failures += 1;
            if state.consecutive_failures >= 3 {
                state.blacklisted_until_ms = request.timestamp_ms + 60_000;
            }
        } else {
            self.failures.remove(&request.selected_provider);
        }

        self.window.push_back(request);
        while self.window.len() > self.max_window {
            self.window.pop_front();
        }
    }

    pub fn metrics_per_provider(&self) -> BTreeMap<String, ProviderMetrics> {
        let mut grouped: BTreeMap<String, Vec<&RequestTelemetry>> = BTreeMap::new();
        for req in &self.window {
            grouped
                .entry(req.selected_provider.clone())
                .or_default()
                .push(req);
        }

        grouped
            .into_iter()
            .map(|(provider, items)| {
                let samples = items.len();
                let mut latencies: Vec<u64> = items.iter().map(|r| r.latency_ms).collect();
                latencies.sort_unstable();

                let success = items.iter().filter(|r| r.success).count();
                let fail = samples - success;
                let timeout = items.iter().filter(|r| r.timeout).count();
                let latency_sum: u64 = latencies.iter().sum();
                let span_ms = items
                    .last()
                    .zip(items.first())
                    .map(|(last, first)| last.timestamp_ms.saturating_sub(first.timestamp_ms))
                    .unwrap_or_default();

                let metrics = ProviderMetrics {
                    avg_latency_ms: if samples > 0 {
                        latency_sum / samples as u64
                    } else {
                        0
                    },
                    p50_latency_ms: percentile(&latencies, 0.50),
                    p95_latency_ms: percentile(&latencies, 0.95),
                    success_rate: ratio(success, samples),
                    failure_rate: ratio(fail, samples),
                    timeout_rate: ratio(timeout, samples),
                    throughput_rps: if span_ms == 0 {
                        samples as f64
                    } else {
                        (samples as f64) / ((span_ms as f64) / 1000.0)
                    },
                    samples,
                };
                (provider, metrics)
            })
            .collect()
    }

    pub fn task_summaries(&self) -> BTreeMap<String, TaskTypeSummary> {
        let mut tasks: BTreeMap<String, BTreeMap<String, (u64, usize)>> = BTreeMap::new();
        for req in &self.window {
            let provider_map = tasks.entry(req.task_type.clone()).or_default();
            let entry = provider_map
                .entry(req.selected_provider.clone())
                .or_default();
            entry.0 += req.latency_ms;
            entry.1 += 1;
        }

        tasks
            .into_iter()
            .filter_map(|(task, providers)| {
                let mut ranked: Vec<(String, u64)> = providers
                    .into_iter()
                    .map(|(provider, (sum, count))| (provider, sum / count as u64))
                    .collect();
                ranked.sort_by(|a, b| a.1.cmp(&b.1).then_with(|| a.0.cmp(&b.0)));
                ranked.first().zip(ranked.last()).map(|(best, worst)| {
                    (
                        task,
                        TaskTypeSummary {
                            best_provider: best.0.clone(),
                            worst_provider: worst.0.clone(),
                        },
                    )
                })
            })
            .collect()
    }

    pub fn historically_best_provider(
        &self,
        task_type: &str,
        input_size: usize,
        device: Option<&DeviceProfileSnapshot>,
    ) -> Option<String> {
        let mut by_provider: BTreeMap<String, (u64, usize)> = BTreeMap::new();
        for req in &self.window {
            if req.task_type != task_type {
                continue;
            }
            if req.input_size.abs_diff(input_size) > input_size.max(1) {
                continue;
            }
            if let Some(snapshot) = device {
                let Some(req_device) = &req.device_profile else {
                    continue;
                };
                if req_device.device_hash != snapshot.device_hash {
                    continue;
                }
            }

            let entry = by_provider
                .entry(req.selected_provider.clone())
                .or_default();
            entry.0 += req.latency_ms;
            entry.1 += 1;
        }

        by_provider
            .into_iter()
            .map(|(provider, (sum, count))| (provider, sum / count as u64, count))
            .max_by(|a, b| {
                // lower latency better; higher sample count better
                b.1.cmp(&a.1)
                    .then_with(|| a.2.cmp(&b.2))
                    .then_with(|| b.0.cmp(&a.0))
            })
            .map(|row| row.0)
    }

    pub fn score_provider(
        &self,
        config: &AdaptiveConfig,
        provider: &str,
        task_type: &str,
        base_score: i32,
        now_ms: u64,
        is_cloud: bool,
        estimated_cost_micros: u64,
        unhealthy: bool,
    ) -> ScoreBreakdown {
        let mut reason_codes = Vec::new();

        if config.private_mode && is_cloud {
            reason_codes.push("policy.private_mode_cloud_block".to_string());
            return finalize(provider, base_score, -1000, reason_codes, 1.0);
        }
        if unhealthy {
            reason_codes.push("policy.unhealthy_provider_block".to_string());
            return finalize(provider, base_score, -1000, reason_codes, 1.0);
        }
        if estimated_cost_micros > config.cost_cap_usd_micros {
            reason_codes.push("policy.cost_cap_block".to_string());
            return finalize(provider, base_score, -1000, reason_codes, 1.0);
        }

        let mut adjustment = 0;

        if let Some(state) = self.failures.get(provider) {
            if state.blacklisted_until_ms > now_ms {
                reason_codes.push("telemetry.failure_cooldown_penalty".to_string());
                adjustment -= 300;
            }
        }

        if config.enable_adaptive_routing {
            let metrics = self.metrics_per_provider();
            if let Some(pm) = metrics.get(provider) {
                if pm.samples < 3 {
                    reason_codes.push("telemetry.insufficient_samples".to_string());
                } else {
                    let fast = pm.p50_latency_ms <= 150;
                    let stable = pm.failure_rate <= 0.1;
                    if fast {
                        reason_codes.push("telemetry.fast_provider_boost".to_string());
                        adjustment += 50;
                    }
                    if !stable {
                        reason_codes.push("telemetry.failure_penalty".to_string());
                        adjustment -= 120;
                    }
                }
            }

            if let Some(best) = self.historically_best_provider(task_type, 1024, None) {
                if best == provider {
                    reason_codes.push("telemetry.historical_task_fit_boost".to_string());
                    adjustment += 25;
                }
            }
        }

        finalize(
            provider,
            base_score,
            adjustment,
            reason_codes,
            confidence_for(self.window.len(), config.adaptive_window_size),
        )
    }

    pub fn explain_adaptive(
        &self,
        provider: &str,
        task_type: &str,
        config: &AdaptiveConfig,
    ) -> ExplainAdaptive {
        let score = self.score_provider(config, provider, task_type, 100, 0, false, 0, false);
        let changed = score.telemetry_adjustment != 0;
        ExplainAdaptive {
            changed,
            what_changed: format!(
                "provider={} telemetry_adjustment={} final_score={}",
                provider, score.telemetry_adjustment, score.final_score
            ),
            why: if score.reason_codes.is_empty() {
                "no telemetry adjustments were applied".to_string()
            } else {
                score.reason_codes.join(",")
            },
            telemetry_basis: format!("window_size={}", self.window.len()),
            confidence: score.confidence,
        }
    }

    pub fn preload_decision(&self, safe_threshold_bytes: u64) -> PreloadDecision {
        let mut counts: BTreeMap<String, usize> = BTreeMap::new();
        let mut latest_used_memory = 0;

        for req in &self.window {
            *counts.entry(req.selected_provider.clone()).or_default() += 1;
            if let Some(mem) = &req.memory_snapshot {
                latest_used_memory = mem.used_bytes;
            }
        }

        if latest_used_memory > safe_threshold_bytes {
            return PreloadDecision {
                preload: vec![],
                unload: counts.keys().cloned().collect(),
                reason: "memory pressure detected; avoid preload".to_string(),
            };
        }

        let mut ranked: Vec<(String, usize)> = counts.into_iter().collect();
        ranked.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

        let preload = ranked.iter().take(2).map(|p| p.0.clone()).collect();
        let unload = ranked.iter().rev().take(1).map(|p| p.0.clone()).collect();

        PreloadDecision {
            preload,
            unload,
            reason: "frequency and recent usage based preload".to_string(),
        }
    }

    pub fn device_profile(&self, device_hash: &str) -> DeviceProfile {
        let mut preferred: BTreeMap<String, usize> = BTreeMap::new();
        let mut failures: BTreeMap<String, usize> = BTreeMap::new();

        for req in &self.window {
            let Some(device) = &req.device_profile else {
                continue;
            };
            if device.device_hash != device_hash {
                continue;
            }
            *preferred.entry(req.selected_provider.clone()).or_default() += 1;
            if !req.success {
                *failures.entry(req.selected_provider.clone()).or_default() += 1;
            }
        }

        let mut preferred_vec: Vec<(String, usize)> = preferred.into_iter().collect();
        preferred_vec.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

        DeviceProfile {
            device_hash: device_hash.to_string(),
            preferred_providers: preferred_vec.into_iter().map(|x| x.0).collect(),
            provider_failures: failures,
        }
    }
}

fn finalize(
    provider: &str,
    base_score: i32,
    telemetry_adjustment: i32,
    reason_codes: Vec<String>,
    confidence: f64,
) -> ScoreBreakdown {
    ScoreBreakdown {
        provider: provider.to_string(),
        base_score,
        telemetry_adjustment,
        final_score: base_score + telemetry_adjustment,
        reason_codes,
        confidence,
    }
}

fn percentile(sorted: &[u64], pct: f64) -> u64 {
    if sorted.is_empty() {
        return 0;
    }
    let idx = ((sorted.len() as f64 - 1.0) * pct).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

fn ratio(part: usize, total: usize) -> f64 {
    if total == 0 {
        return 0.0;
    }
    part as f64 / total as f64
}

fn confidence_for(samples: usize, target: usize) -> f64 {
    if target == 0 {
        return 1.0;
    }
    (samples as f64 / target as f64).clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sawyer_telemetry::{DeviceProfileSnapshot, MemorySnapshot};

    fn req(
        id: &str,
        provider: &str,
        latency_ms: u64,
        success: bool,
        timeout: bool,
        timestamp_ms: u64,
    ) -> RequestTelemetry {
        RequestTelemetry {
            request_id: id.to_string(),
            timestamp_ms,
            task_type: "chat".to_string(),
            input_size: 1000,
            selected_provider: provider.to_string(),
            rejected_providers: vec![],
            latency_ms,
            cost_usd_micros: Some(100),
            success,
            degraded: !success,
            timeout,
            tokens_used: Some(100),
            memory_snapshot: Some(MemorySnapshot {
                used_bytes: 100,
                safe_threshold_bytes: 500,
            }),
            device_profile: Some(DeviceProfileSnapshot {
                device_hash: "dev1".to_string(),
                cpu_arch: "x86_64".to_string(),
                memory_total_bytes: 10_000,
            }),
        }
    }

    #[test]
    fn rolling_metrics_are_deterministic() {
        let mut index = HistoryIndex::new(10);
        index.push(req("1", "a", 100, true, false, 1));
        index.push(req("2", "a", 300, true, false, 2));
        index.push(req("3", "a", 400, false, true, 3));

        let m = index.metrics_per_provider();
        let pm = m.get("a").expect("metrics");
        assert_eq!(pm.avg_latency_ms, 266);
        assert_eq!(pm.p50_latency_ms, 300);
        assert_eq!(pm.p95_latency_ms, 400);
        assert_eq!(pm.samples, 3);
        assert!(pm.failure_rate > 0.3);
    }

    #[test]
    fn policy_invariants_are_preserved() {
        let index = HistoryIndex::new(10);
        let cfg = AdaptiveConfig::default();

        let score = index.score_provider(&cfg, "cloud-x", "chat", 100, 0, true, 0, false);
        assert!(score.final_score < -800);
        assert!(score
            .reason_codes
            .contains(&"policy.private_mode_cloud_block".to_string()));
    }

    #[test]
    fn failure_penalty_and_cooldown_apply() {
        let mut index = HistoryIndex::new(10);
        index.push(req("1", "a", 100, false, false, 1));
        index.push(req("2", "a", 100, false, false, 2));
        index.push(req("3", "a", 100, false, false, 3));

        let score = index.score_provider(
            &AdaptiveConfig::default(),
            "a",
            "chat",
            100,
            4,
            false,
            0,
            false,
        );
        assert!(score
            .reason_codes
            .contains(&"telemetry.failure_cooldown_penalty".to_string()));
        assert!(score.final_score < 0);
    }

    #[test]
    fn preload_adapts_to_memory_pressure() {
        let mut index = HistoryIndex::new(10);
        let mut r = req("1", "a", 100, true, false, 1);
        r.memory_snapshot = Some(MemorySnapshot {
            used_bytes: 700,
            safe_threshold_bytes: 600,
        });
        index.push(r);

        let decision = index.preload_decision(600);
        assert!(decision.preload.is_empty());
        assert_eq!(decision.unload, vec!["a".to_string()]);
    }

    #[test]
    fn cold_start_vs_warm_behavior_is_stable() {
        let index = HistoryIndex::new(10);
        let cold = index.explain_adaptive("a", "chat", &AdaptiveConfig::default());
        assert!(!cold.changed);

        let mut warm_index = HistoryIndex::new(10);
        warm_index.push(req("1", "a", 100, true, false, 1));
        warm_index.push(req("2", "a", 100, true, false, 2));
        warm_index.push(req("3", "a", 100, true, false, 3));
        let warm = warm_index.explain_adaptive("a", "chat", &AdaptiveConfig::default());
        assert!(warm.confidence > cold.confidence);
    }

    #[test]
    fn deterministic_results_with_same_history() {
        let mut a = HistoryIndex::new(10);
        let mut b = HistoryIndex::new(10);
        for i in 0..5 {
            let r = req(&i.to_string(), "a", 100 + i, true, false, i);
            a.push(r.clone());
            b.push(r);
        }

        assert_eq!(
            a.score_provider(
                &AdaptiveConfig::default(),
                "a",
                "chat",
                100,
                10,
                false,
                0,
                false
            )
            .final_score,
            b.score_provider(
                &AdaptiveConfig::default(),
                "a",
                "chat",
                100,
                10,
                false,
                0,
                false
            )
            .final_score
        );
    }

    #[test]
    fn explain_output_contains_basis() {
        let mut index = HistoryIndex::new(10);
        index.push(req("1", "a", 100, true, false, 1));
        let explain = index.explain_adaptive("a", "chat", &AdaptiveConfig::default());
        assert!(explain.telemetry_basis.contains("window_size=1"));
    }
}
