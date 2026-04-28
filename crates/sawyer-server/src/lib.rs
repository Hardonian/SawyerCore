use std::{net::SocketAddr, sync::Arc};

use anyhow::Context;
use axum::{
    extract::{DefaultBodyLimit, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use sawyer_kernels::detect_cpu_features;
use sawyer_llm::{ChatRequest, LocalAdapter, Registry, UnavailableAdapter};
use sawyer_sim::{Agent, ScenarioRunner, SimEvent};
use serde::{Deserialize, Serialize};

#[derive(Clone)]
pub struct ServerState {
    pub registry: Registry,
    pub adapter: Arc<dyn LocalAdapter>,
}

impl Default for ServerState {
    fn default() -> Self {
        Self {
            registry: Registry::default(),
            adapter: Arc::new(UnavailableAdapter),
        }
    }
}

pub fn router(state: ServerState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
        .route("/metrics", get(metrics))
        .route("/v1/chat/completions", post(chat))
        .route("/sim/run", post(sim_run))
        .layer(DefaultBodyLimit::max(1024 * 1024))
        .with_state(state)
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

#[derive(Serialize)]
struct StatusResponse {
    degraded: bool,
    models_available: usize,
    cpu: sawyer_kernels::CpuFeatures,
}

async fn status(State(state): State<ServerState>) -> Json<StatusResponse> {
    let models_available = state.registry.models.iter().filter(|m| m.available).count();
    Json(StatusResponse {
        degraded: models_available == 0,
        models_available,
        cpu: detect_cpu_features(),
    })
}

#[derive(Serialize)]
struct MetricsResponse {
    latency_ms: u128,
    memory_bytes: usize,
    events_per_sec: f64,
    token_throughput: f64,
    task_throughput: f64,
}

async fn metrics() -> Json<MetricsResponse> {
    Json(MetricsResponse {
        latency_ms: 0,
        memory_bytes: 0,
        events_per_sec: 0.0,
        token_throughput: 0.0,
        task_throughput: 0.0,
    })
}

async fn chat(
    State(state): State<ServerState>,
    Json(request): Json<ChatRequest>,
) -> impl IntoResponse {
    match state.adapter.chat(request) {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(err) => {
            let body = serde_json::json!({
                "error": {
                    "type": "model_unavailable",
                    "message": err.to_string(),
                    "degraded": true
                }
            });
            (StatusCode::SERVICE_UNAVAILABLE, Json(body)).into_response()
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct SimRunRequest {
    pub seed: u64,
    pub events: Vec<SimEvent>,
}

#[derive(Debug, Serialize)]
pub struct SimRunResponse {
    pub seed: u64,
    pub events_processed: usize,
    pub replayable: bool,
    pub latency_ms: u128,
    pub events_per_sec: f64,
}

async fn sim_run(Json(request): Json<SimRunRequest>) -> Json<SimRunResponse> {
    let mut runner = ScenarioRunner::new(request.seed);
    for event in request.events {
        runner.push_event(event);
    }
    let mut agents = vec![Agent::new(1), Agent::new(2), Agent::new(3)];
    let (replay, metrics) = runner.run(&mut agents);
    Json(SimRunResponse {
        seed: replay.seed,
        events_processed: replay.events.len(),
        replayable: true,
        latency_ms: metrics.latency_ms,
        events_per_sec: metrics.events_per_sec,
    })
}

pub async fn serve(bind: &str, state: ServerState) -> anyhow::Result<()> {
    let addr: SocketAddr = bind.parse().context("invalid bind address")?;
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind {bind}"))?;

    axum::serve(listener, router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server error")
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}
