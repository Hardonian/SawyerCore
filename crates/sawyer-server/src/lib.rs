use std::{
    collections::HashMap,
    fs::OpenOptions,
    io::Write,
    net::{IpAddr, SocketAddr},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use anyhow::{bail, Context};
use axum::{
    extract::{DefaultBodyLimit, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use sawyer_kernels::detect_cpu_features;
use sawyer_llm::{ChatRequest, LocalAdapter, Registry, UnavailableAdapter};
use sawyer_sim::{Agent, ScenarioRunner, SimEvent};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    pub bind_host: String,
    pub allow_lan: bool,
    pub require_node_token: bool,
    pub max_request_bytes: usize,
    pub max_context_tokens: usize,
    pub allow_cloud: bool,
    pub private_mode: bool,
    pub redact_logs: bool,
    pub audit_log_path: String,
    pub rate_limit_per_minute: u32,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            bind_host: "127.0.0.1".to_string(),
            allow_lan: false,
            require_node_token: true,
            max_request_bytes: 1024 * 1024,
            max_context_tokens: 8_192,
            allow_cloud: false,
            private_mode: true,
            redact_logs: true,
            audit_log_path: "./logs/sawyer-audit.log".to_string(),
            rate_limit_per_minute: 120,
        }
    }
}

impl SecurityConfig {
    pub fn validate(&self, unsafe_dev: bool) -> anyhow::Result<()> {
        if self.private_mode && self.allow_cloud {
            if unsafe_dev {
                eprintln!(
                    "\n⚠️  UNSAFE DEV MODE ENABLED: private_mode + allow_cloud conflict bypassed.\nThis configuration is not production-safe.\n"
                );
            } else {
                bail!("invalid security config: private_mode cannot be combined with allow_cloud");
            }
        }
        if self.max_request_bytes == 0
            || self.max_context_tokens == 0
            || self.rate_limit_per_minute == 0
        {
            if unsafe_dev {
                eprintln!(
                    "\n⚠️  UNSAFE DEV MODE ENABLED: security limits include zero values.\nThis configuration is not production-safe.\n"
                );
            } else {
                bail!("invalid security config: limits must be non-zero");
            }
        }
        if !self.allow_lan && self.bind_host != "127.0.0.1" {
            if unsafe_dev {
                eprintln!(
                    "\n⚠️  UNSAFE DEV MODE ENABLED: non-local bind without allow_lan.\nThis configuration is not production-safe.\n"
                );
            } else {
                bail!("invalid security config: non-local bind requires allow_lan=true");
            }
        }
        Ok(())
    }

    pub fn cloud_permitted(&self) -> bool {
        !self.private_mode && self.allow_cloud
    }
}

#[derive(Clone)]
pub struct ServerState {
    pub registry: Registry,
    pub adapter: Arc<dyn LocalAdapter>,
    pub security: SecurityConfig,
    pub node_token: Option<String>,
    pub cloud_api_key_present: bool,
    limiter: Arc<Mutex<HashMap<IpAddr, Vec<Instant>>>>,
}

impl Default for ServerState {
    fn default() -> Self {
        Self {
            registry: Registry::default(),
            adapter: Arc::new(UnavailableAdapter),
            security: SecurityConfig::default(),
            node_token: None,
            cloud_api_key_present: false,
            limiter: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl ServerState {
    pub fn with_security(
        security: SecurityConfig,
        node_token: Option<String>,
        cloud_api_key_present: bool,
    ) -> Self {
        Self {
            security,
            node_token,
            cloud_api_key_present,
            ..Self::default()
        }
    }

    pub fn validate_startup(&self, unsafe_dev: bool) -> anyhow::Result<()> {
        self.security.validate(unsafe_dev)?;
        if self.security.allow_lan && self.security.require_node_token && self.node_token.is_none()
        {
            bail!("invalid security config: allow_lan=true requires node token");
        }
        if self.security.allow_cloud && !self.security.private_mode && !self.cloud_api_key_present {
            bail!("invalid security config: cloud enabled but no cloud API key configured");
        }
        Ok(())
    }

    fn log_audit(&self, event: &str, payload: &str) {
        if self.security.audit_log_path.is_empty() {
            return;
        }
        let mut path = PathBuf::from(&self.security.audit_log_path);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let content = if self.security.redact_logs {
            redact_sensitive(payload)
        } else {
            payload.to_string()
        };
        let line = format!(
            "{} event={} payload={}\n",
            chrono_like_now(),
            event,
            content
        );
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = file.write_all(line.as_bytes());
        }
        path.clear();
    }
}

fn chrono_like_now() -> String {
    format!("{:?}", std::time::SystemTime::now())
}

fn redact_sensitive(input: &str) -> String {
    input
        .replace("api_key", "[REDACTED_KEY]")
        .replace("token", "[REDACTED_TOKEN]")
        .replace("Authorization", "[REDACTED_AUTH]")
}

pub fn router(state: ServerState) -> Router {
    let max = state.security.max_request_bytes;
    Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
        .route("/metrics", get(metrics))
        .route("/explain/last", get(explain_last))
        .route("/v1/chat/completions", post(chat))
        .route("/sim/run", post(sim_run))
        .layer(DefaultBodyLimit::max(max))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            security_middleware,
        ))
        .with_state(state)
}

async fn security_middleware(
    State(state): State<ServerState>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Response {
    let is_lan_request = headers
        .get("x-sawyer-lan")
        .and_then(|h| h.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    if !state.security.allow_lan && is_lan_request {
        return (StatusCode::FORBIDDEN, "LAN access disabled").into_response();
    }

    let addr = headers
        .get("x-client-ip")
        .and_then(|h| h.to_str().ok())
        .and_then(|v| v.parse::<IpAddr>().ok())
        .unwrap_or(IpAddr::from([127, 0, 0, 1]));

    if is_rate_limited(&state, addr) {
        return (StatusCode::TOO_MANY_REQUESTS, "rate limit exceeded").into_response();
    }

    let path = request.uri().path().to_string();
    if state.security.allow_lan && state.security.require_node_token && path.starts_with("/sim/") {
        let supplied = headers
            .get("x-node-token")
            .and_then(|h| h.to_str().ok())
            .map(str::to_string);
        if supplied.is_none() || supplied != state.node_token {
            return (StatusCode::UNAUTHORIZED, "missing or invalid node token").into_response();
        }
    }

    next.run(request).await
}

fn is_rate_limited(state: &ServerState, ip: IpAddr) -> bool {
    let mut limiter = state.limiter.lock().expect("rate limiter poisoned");
    let now = Instant::now();
    let cutoff = now - Duration::from_secs(60);
    let bucket = limiter.entry(ip).or_default();
    bucket.retain(|t| *t >= cutoff);
    if bucket.len() as u32 >= state.security.rate_limit_per_minute {
        return true;
    }
    bucket.push(now);
    false
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
    private_mode: bool,
    cloud_permitted: bool,
}

async fn status(State(state): State<ServerState>) -> Json<StatusResponse> {
    let models_available = state.registry.models.iter().filter(|m| m.available).count();
    Json(StatusResponse {
        degraded: models_available == 0,
        models_available,
        cpu: detect_cpu_features(),
        private_mode: state.security.private_mode,
        cloud_permitted: state.security.cloud_permitted() && state.cloud_api_key_present,
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
    if total_context_tokens(&request) > state.security.max_context_tokens {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(
                serde_json::json!({"error": {"type": "context_limit_exceeded", "degraded": true}}),
            ),
        )
            .into_response();
    }

    if request.model.starts_with("cloud/") {
        if state.security.private_mode {
            return (
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": {"type": "private_mode", "message": "cloud blocked by private mode", "degraded": true}})),
            )
                .into_response();
        }
        if !state.security.allow_cloud || !state.cloud_api_key_present {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({"error": {"type": "cloud_unavailable", "degraded": true}})),
            )
                .into_response();
        }
    }

    let req_for_log = serde_json::to_string(&request).unwrap_or_else(|_| "{}".to_string());
    state.log_audit("chat_request", &req_for_log);

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

fn total_context_tokens(request: &ChatRequest) -> usize {
    request
        .messages
        .iter()
        .map(|m| m.content.split_whitespace().count())
        .sum()
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

#[derive(Serialize)]
struct ExplainUnavailable {
    error: &'static str,
    degraded: bool,
}

async fn explain_last() -> impl IntoResponse {
    let path = std::env::var("SAWYER_STATE_DIR").unwrap_or_else(|_| ".sawyer".to_string());
    let explain_path = std::path::Path::new(&path).join("last-explain.json");
    match std::fs::read_to_string(explain_path) {
        Ok(body) => (StatusCode::OK, body).into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(ExplainUnavailable {
                error: "no routing explanation captured yet",
                degraded: true,
            }),
        )
            .into_response(),
    }
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

pub async fn serve(bind: &str, state: ServerState, unsafe_dev: bool) -> anyhow::Result<()> {
    state.validate_startup(unsafe_dev)?;
    let addr: SocketAddr = bind.parse().context("invalid bind address")?;
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .with_context(|| format!("failed to bind {bind}"))?;

    axum::serve(listener, router(state).into_make_service())
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("server error")
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use tower::ServiceExt;

    fn chat_req(model: &str, content: &str) -> String {
        serde_json::json!({
            "model": model,
            "messages": [{"role": "user", "content": content}]
        })
        .to_string()
    }

    #[test]
    fn localhost_default() {
        let state = ServerState::default();
        assert_eq!(state.security.bind_host, "127.0.0.1");
        assert!(!state.security.allow_lan);
    }

    #[tokio::test]
    async fn lan_denied_unless_enabled() {
        let app = router(ServerState::default());
        let req = Request::builder()
            .uri("/health")
            .header("x-sawyer-lan", "true")
            .header("x-client-ip", "10.0.0.2")
            .body(Body::empty())
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn missing_node_token_denies_lan_control_calls() {
        let state = ServerState {
            security: SecurityConfig {
                allow_lan: true,
                ..SecurityConfig::default()
            },
            node_token: Some("expected".to_string()),
            ..ServerState::default()
        };
        let app = router(state);
        let req = Request::builder()
            .uri("/sim/run")
            .method("POST")
            .header("content-type", "application/json")
            .header("x-sawyer-lan", "true")
            .header("x-client-ip", "10.0.0.2")
            .body(Body::from(
                serde_json::json!({"seed": 1, "events": []}).to_string(),
            ))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn private_mode_blocks_cloud() {
        let app = router(ServerState::default());
        let req = Request::builder()
            .uri("/v1/chat/completions")
            .method("POST")
            .header("content-type", "application/json")
            .body(Body::from(chat_req("cloud/gpt", "hello")))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn secrets_redacted_from_audit_logs() {
        let tmp_path =
            std::env::temp_dir().join(format!("sawyer-audit-{}.log", std::process::id()));
        let state = ServerState {
            security: SecurityConfig {
                audit_log_path: tmp_path.display().to_string(),
                ..SecurityConfig::default()
            },
            ..ServerState::default()
        };
        let app = router(state.clone());
        let req = Request::builder()
            .uri("/v1/chat/completions")
            .method("POST")
            .header("content-type", "application/json")
            .body(Body::from(chat_req("local", "token=abc api_key=xyz")))
            .unwrap();
        let _ = app.oneshot(req).await.unwrap();
        let text = std::fs::read_to_string(&tmp_path).unwrap();
        let _ = std::fs::remove_file(&tmp_path);
        assert!(!text.contains("api_key"));
        assert!(!text.contains("token"));
    }

    #[tokio::test]
    async fn oversized_request_denied() {
        let state = ServerState {
            security: SecurityConfig {
                max_request_bytes: 16,
                ..SecurityConfig::default()
            },
            ..ServerState::default()
        };
        let app = router(state);
        let req = Request::builder()
            .uri("/v1/chat/completions")
            .method("POST")
            .header("content-type", "application/json")
            .body(Body::from(chat_req("local", "this body is too large")))
            .unwrap();
        let resp = app.oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::PAYLOAD_TOO_LARGE);
    }

    #[test]
    fn unsafe_config_fails_closed() {
        let state = ServerState {
            security: SecurityConfig {
                private_mode: true,
                allow_cloud: true,
                ..SecurityConfig::default()
            },
            ..ServerState::default()
        };
        assert!(state.validate_startup(false).is_err());
    }
}
