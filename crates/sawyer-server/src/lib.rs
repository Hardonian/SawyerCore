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
use sawyer_telemetry::{TelemetryEvent, TelemetryCollector};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BillingConfig {
    pub enabled: bool,
    pub stripe_api_key: String,
    pub default_rate_per_task: f64,
    pub default_rate_per_compute_minute: f64,
    pub default_rate_per_agent_run: f64,
}

impl Default for BillingConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            stripe_api_key: String::new(),
            default_rate_per_task: 0.01,
            default_rate_per_compute_minute: 0.05,
            default_rate_per_agent_run: 0.10,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantConfig {
    pub id: String,
    pub api_key: String,
    pub name: String,
    pub plan: String,
    pub max_concurrent_tasks: u32,
    pub max_storage_bytes: u64,
    pub max_api_calls_per_minute: u32,
    pub max_agents: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantUsage {
    pub tenant_id: String,
    pub tasks_this_period: u64,
    pub compute_minutes_this_period: f64,
    pub agent_runs_this_period: u64,
    pub api_calls_this_period: u64,
    pub total_cost_usd: f64,
    pub period_start: String,
    pub period_end: String,
}

impl TenantUsage {
    pub fn new(tenant_id: &str) -> Self {
        let now = chrono_like_now();
        Self {
            tenant_id: tenant_id.to_string(),
            tasks_this_period: 0,
            compute_minutes_this_period: 0.0,
            agent_runs_this_period: 0,
            api_calls_this_period: 0,
            total_cost_usd: 0.0,
            period_start: now.clone(),
            period_end: now,
        }
    }

    pub fn record_task(&mut self, rate: f64) {
        self.tasks_this_period += 1;
        self.total_cost_usd += rate;
    }

    pub fn record_compute(&mut self, duration_ms: u128, rate_per_minute: f64) {
        let minutes = duration_ms as f64 / 60000.0;
        self.compute_minutes_this_period += minutes;
        self.total_cost_usd += minutes * rate_per_minute;
    }

    pub fn record_agent_run(&mut self, rate: f64) {
        self.agent_runs_this_period += 1;
        self.total_cost_usd += rate;
    }

    pub fn record_api_call(&mut self) {
        self.api_calls_this_period += 1;
    }
}

#[derive(Clone)]
pub struct BillingState {
    pub config: BillingConfig,
    pub tenants: Arc<Mutex<HashMap<String, TenantConfig>>>,
    pub usage: Arc<Mutex<HashMap<String, TenantUsage>>>,
    pub telemetry: Arc<Mutex<TelemetryCollector>>,
}

impl Default for BillingState {
    fn default() -> Self {
        Self {
            config: BillingConfig::default(),
            tenants: Arc::new(Mutex::new(HashMap::new())),
            usage: Arc::new(Mutex::new(HashMap::new())),
            telemetry: Arc::new(Mutex::new(TelemetryCollector::new())),
        }
    }
}

impl BillingState {
    pub fn register_tenant(&self, tenant: TenantConfig) {
        let mut tenants = self.tenants.lock().expect("tenant registry poisoned");
        tenants.insert(tenant.id.clone(), tenant);
    }

    pub fn validate_api_key(&self, api_key: &str) -> Option<TenantConfig> {
        let tenants = self.tenants.lock().expect("tenant registry poisoned");
        tenants.values().find(|t| t.api_key == api_key).cloned()
    }

    pub fn get_or_create_usage(&self, tenant_id: &str) -> TenantUsage {
        let mut usage = self.usage.lock().expect("usage store poisoned");
        usage
            .entry(tenant_id.to_string())
            .or_insert_with(|| TenantUsage::new(tenant_id))
            .clone()
    }

    pub fn record_task_usage(&self, tenant_id: &str) {
        let mut usage = self.usage.lock().expect("usage store poisoned");
        let entry = usage
            .entry(tenant_id.to_string())
            .or_insert_with(|| TenantUsage::new(tenant_id));
        entry.record_task(self.config.default_rate_per_task);
    }

    pub fn record_compute_usage(&self, tenant_id: &str, duration_ms: u128) {
        let mut usage = self.usage.lock().expect("usage store poisoned");
        let entry = usage
            .entry(tenant_id.to_string())
            .or_insert_with(|| TenantUsage::new(tenant_id));
        entry.record_compute(duration_ms, self.config.default_rate_per_compute_minute);
    }

    pub fn check_quota(&self, tenant_id: &str) -> (bool, Option<String>) {
        let tenants = self.tenants.lock().expect("tenant registry poisoned");
        let tenant = tenants.get(tenant_id);
        if tenant.is_none() {
            return (false, Some("tenant not found".to_string()));
        }
        let tenant = tenant.unwrap();

        let usage = self.usage.lock().expect("usage store poisoned");
        let tenant_usage = usage.get(tenant_id);
        if tenant_usage.is_none() {
            return (true, None);
        }
        let tenant_usage = tenant_usage.unwrap();

        if tenant_usage.api_calls_this_period >= tenant.max_api_calls_per_minute as u64 {
            return (
                false,
                Some("API call limit exceeded".to_string()),
            );
        }

        (true, None)
    }

    pub fn get_usage_report(&self, tenant_id: &str) -> Option<TenantUsage> {
        let usage = self.usage.lock().expect("usage store poisoned");
        usage.get(tenant_id).cloned()
    }
}

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
    pub billing: BillingState,
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
            billing: BillingState::default(),
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
        .route("/billing/usage/:tenant_id", get(billing_usage))
        .route("/billing/register_tenant", post(billing_register_tenant))
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
    headers: HeaderMap,
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

    let tenant_id = extract_tenant_id_from_headers(&state, &headers);

    let req_for_log = serde_json::to_string(&request).unwrap_or_else(|_| "{}".to_string());
    state.log_audit("chat_request", &req_for_log);

    let start_time = Instant::now();
    let result = state.adapter.chat(request);
    let duration_ms = start_time.elapsed().as_millis();

    if let Some(tid) = &tenant_id {
        state.billing.record_task_usage(tid);
        state.billing.record_compute_usage(tid, duration_ms);
        if let Some(telemetry) = state.billing.telemetry.lock().ok() {
            let _ = telemetry.record_event(TelemetryEvent::TaskCompleted {
                tenant_id: tid.clone(),
                duration_ms,
                model: request.model.clone(),
            });
        }
    }

    match result {
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

fn extract_tenant_id_from_headers(state: &ServerState, headers: &HeaderMap) -> Option<String> {
    let api_key = headers
        .get("x-api-key")
        .and_then(|h| h.to_str().ok())?;
    
    let tenant = state.billing.validate_api_key(api_key);
    tenant.map(|t| t.id)
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

#[derive(Serialize)]
struct BillingUsageResponse {
    tenant_id: String,
    tasks_this_period: u64,
    compute_minutes_this_period: f64,
    agent_runs_this_period: u64,
    api_calls_this_period: u64,
    total_cost_usd: f64,
    period_start: String,
    period_end: String,
}

#[derive(Deserialize)]
struct RegisterTenantRequest {
    id: String,
    api_key: String,
    name: String,
    plan: String,
    max_concurrent_tasks: u32,
    max_storage_bytes: u64,
    max_api_calls_per_minute: u32,
    max_agents: u32,
}

#[derive(Serialize)]
struct RegisterTenantResponse {
    success: bool,
    tenant_id: String,
}

async fn billing_usage(
    State(state): State<ServerState>,
    axum::extract::Path(tenant_id): axum::extract::Path<String>,
) -> impl IntoResponse {
    let usage = state.billing.get_usage_report(&tenant_id);
    match usage {
        Some(u) => (
            StatusCode::OK,
            Json(BillingUsageResponse {
                tenant_id: u.tenant_id,
                tasks_this_period: u.tasks_this_period,
                compute_minutes_this_period: u.compute_minutes_this_period,
                agent_runs_this_period: u.agent_runs_this_period,
                api_calls_this_period: u.api_calls_this_period,
                total_cost_usd: u.total_cost_usd,
                period_start: u.period_start,
                period_end: u.period_end,
            }),
        )
            .into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "tenant usage not found"})),
        )
            .into_response(),
    }
}

async fn billing_register_tenant(
    State(state): State<ServerState>,
    Json(request): Json<RegisterTenantRequest>,
) -> impl IntoResponse {
    let tenant = TenantConfig {
        id: request.id.clone(),
        api_key: request.api_key.clone(),
        name: request.name.clone(),
        plan: request.plan.clone(),
        max_concurrent_tasks: request.max_concurrent_tasks,
        max_storage_bytes: request.max_storage_bytes,
        max_api_calls_per_minute: request.max_api_calls_per_minute,
        max_agents: request.max_agents,
    };

    state.billing.register_tenant(tenant);

    (
        StatusCode::CREATED,
        Json(RegisterTenantResponse {
            success: true,
            tenant_id: request.id,
        }),
    )
        .into_response()
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

    #[test]
    fn billing_state_tracks_tenant_usage() {
        let billing = BillingState::default();
        billing.register_tenant(TenantConfig {
            id: "tenant-1".to_string(),
            api_key: "sk_test123".to_string(),
            name: "Test Tenant".to_string(),
            plan: "starter".to_string(),
            max_concurrent_tasks: 10,
            max_storage_bytes: 1_000_000,
            max_api_calls_per_minute: 100,
            max_agents: 5,
        });

        assert!(billing.validate_api_key("sk_test123").is_some());
        assert!(billing.validate_api_key("invalid_key").is_none());

        billing.record_task_usage("tenant-1");
        billing.record_task_usage("tenant-1");
        billing.record_compute_usage("tenant-1", 30_000);

        let usage = billing.get_usage_report("tenant-1").unwrap();
        assert_eq!(usage.tasks_this_period, 2);
        assert!(usage.compute_minutes_this_period > 0.0);
    }

    #[test]
    fn tenant_isolation_prevents_cross_tenant_access() {
        let billing = BillingState::default();
        billing.register_tenant(TenantConfig {
            id: "tenant-a".to_string(),
            api_key: "sk_tenant_a".to_string(),
            name: "Tenant A".to_string(),
            plan: "starter".to_string(),
            max_concurrent_tasks: 10,
            max_storage_bytes: 1_000_000,
            max_api_calls_per_minute: 100,
            max_agents: 5,
        });
        billing.register_tenant(TenantConfig {
            id: "tenant-b".to_string(),
            api_key: "sk_tenant_b".to_string(),
            name: "Tenant B".to_string(),
            plan: "pro".to_string(),
            max_concurrent_tasks: 50,
            max_storage_bytes: 5_000_000,
            max_api_calls_per_minute: 500,
            max_agents: 20,
        });

        let tenant_a = billing.validate_api_key("sk_tenant_a").unwrap();
        let tenant_b = billing.validate_api_key("sk_tenant_b").unwrap();

        assert_eq!(tenant_a.id, "tenant-a");
        assert_eq!(tenant_b.id, "tenant-b");
        assert_ne!(tenant_a.api_key, tenant_b.api_key);

        billing.record_task_usage("tenant-a");
        let usage_a = billing.get_usage_report("tenant-a").unwrap();
        let usage_b = billing.get_usage_report("tenant-b");

        assert_eq!(usage_a.tasks_this_period, 1);
        assert!(usage_b.is_none() || usage_b.unwrap().tasks_this_period == 0);
    }

    #[test]
    fn billing_quota_enforcement() {
        let billing = BillingState::default();
        billing.register_tenant(TenantConfig {
            id: "limited-tenant".to_string(),
            api_key: "sk_limited".to_string(),
            name: "Limited Tenant".to_string(),
            plan: "free".to_string(),
            max_concurrent_tasks: 5,
            max_storage_bytes: 500_000,
            max_api_calls_per_minute: 10,
            max_agents: 1,
        });

        for _ in 0..10 {
            billing.record_task_usage("limited-tenant");
        }

        let (allowed, reason) = billing.check_quota("limited-tenant");
        assert!(!allowed);
        assert!(reason.is_some());
    }
}
