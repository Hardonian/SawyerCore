use std::path::PathBuf;

use anyhow::Result;
use clap::{Args, Parser, Subcommand};
use sawyer_core::{DeterministicRuntime, RuntimeConfig};
use sawyer_kernels::{detect_cpu_features, dot_product, summarize_cpu_execution_path};
use sawyer_server::{serve, SecurityConfig, ServerState};
use sawyer_sim::{Agent, ScenarioRunner, SimEvent};
use sawyer_telemetry::{RequestTelemetry, TelemetryConfig, TelemetryEngine};

#[derive(Parser)]
#[command(
    name = "sawyer",
    about = "SawyerCore deterministic local-first runtime CLI"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Doctor,
    Bench(BenchArgs),
    Calibrate,
    Stats(StatsArgs),
    Explain(ExplainArgs),
    Sim(SimArgs),
    Serve(ServeArgs),
    Models(ModelsArgs),
}

#[derive(Args)]
struct BenchArgs {
    #[command(subcommand)]
    command: BenchCommands,
}

#[derive(Subcommand)]
enum BenchCommands {
    Quick,
    Compare,
}

#[derive(Args)]
struct ExplainArgs {
    #[command(subcommand)]
    command: ExplainCommands,
}

#[derive(Subcommand)]
enum ExplainCommands {
    Adaptive,
}

#[derive(Args)]
struct StatsArgs {
    #[command(subcommand)]
    command: StatsCommands,
}

#[derive(Subcommand)]
enum StatsCommands {
    Providers,
    Tasks,
    Failures,
}

#[derive(Args)]
struct SimArgs {
    #[command(subcommand)]
    command: SimCommands,
}

#[derive(Subcommand)]
enum SimCommands {
    Run,
}

#[derive(Args)]
struct ServeArgs {
    #[arg(long, default_value = "127.0.0.1:8080")]
    bind: String,
    #[arg(long, default_value_t = false)]
    allow_lan: bool,
    #[arg(long, env = "SAWYER_NODE_TOKEN")]
    node_token: Option<String>,
    #[arg(long, default_value_t = 1024 * 1024)]
    max_request_bytes: usize,
    #[arg(long, default_value_t = 8192)]
    max_context_tokens: usize,
    #[arg(long, default_value_t = false)]
    allow_cloud: bool,
    #[arg(long, default_value_t = true)]
    private_mode: bool,
    #[arg(long, default_value_t = true)]
    redact_logs: bool,
    #[arg(long, default_value = "./logs/sawyer-audit.log")]
    audit_log_path: String,
    #[arg(long, default_value_t = 120)]
    rate_limit_per_minute: u32,
    #[arg(long, default_value_t = false)]
    unsafe_dev: bool,
}

#[derive(Args)]
struct ModelsArgs {
    #[command(subcommand)]
    command: ModelsCommands,
}

#[derive(Subcommand)]
enum ModelsCommands {
    List,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, clap::ValueEnum, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum RuntimeMode {
    Tiny,
    Local,
    Performance,
    Gateway,
    Dev,
}

impl RuntimeMode {
    fn description(self) -> &'static str {
        match self {
            Self::Tiny => "CPU-only minimal footprint; local HTTP/llama.cpp when available; no vLLM/LiteLLM",
            Self::Local => "Safe default: local-first with optional vLLM/LiteLLM checks; cloud disabled",
            Self::Performance => "GPU/server oriented: vLLM preferred, higher memory budget, preloading enabled",
            Self::Gateway => "LiteLLM proxy eligible, but local routes first and cloud disabled unless explicitly enabled",
            Self::Dev => "Verbose diagnostics for local development; no production runtime mocks",
        }
    }

    fn explain(self) -> String {
        format!("{} => {}", self, self.description())
    }

    fn all() -> &'static [RuntimeMode] {
        const MODES: [RuntimeMode; 5] = [
            RuntimeMode::Tiny,
            RuntimeMode::Local,
            RuntimeMode::Performance,
            RuntimeMode::Gateway,
            RuntimeMode::Dev,
        ];
        &MODES
    }
}

impl fmt::Display for RuntimeMode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let label = match self {
            Self::Tiny => "tiny",
            Self::Local => "local",
            Self::Performance => "performance",
            Self::Gateway => "gateway",
            Self::Dev => "dev",
        };
        write!(f, "{label}")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct HardwareSnapshot {
    os: String,
    ram_gb: Option<u64>,
    vram_gb: Option<u64>,
    battery_sensitive: bool,
    thermal_constrained: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModelRecommendation {
    model_class: &'static str,
    quantization: &'static str,
    performance_band: &'static str,
    provider: &'static str,
    reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProviderRow {
    provider: &'static str,
    available: bool,
    best_for: &'static str,
    cost: &'static str,
    privacy: &'static str,
    speed: &'static str,
    setup: &'static str,
    reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RoutingExplain {
    selected_provider: String,
    rejected_providers: Vec<String>,
    reason_codes: Vec<String>,
    privacy_decision: String,
    cost_decision: String,
    speed_decision: String,
    fallback_decision: String,
    degraded: bool,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    let cli = Cli::parse();

    match cli.command {
        Commands::Doctor => doctor(),
        Commands::Bench(args) => match args.command {
            BenchCommands::Quick => bench_quick(),
            BenchCommands::Compare => bench_compare(),
        },
        Commands::Calibrate => calibrate(),
        Commands::Stats(args) => stats(args),
        Commands::Explain(args) => match args.command {
            ExplainCommands::Adaptive => explain_adaptive(),
        },
        Commands::Sim(sim) => match sim.command {
            SimCommands::Run => sim_run(),
        },
        Commands::Serve(args) => {
            if args.unsafe_dev {
                eprintln!("\n⚠️⚠️⚠️  UNSAFE DEV MODE ENABLED -- PRODUCTION SAFETY GUARDS ARE RELAXED ⚠️⚠️⚠️\n");
            }
            let security = SecurityConfig {
                bind_host: args
                    .bind
                    .split(':')
                    .next()
                    .unwrap_or("127.0.0.1")
                    .to_string(),
                allow_lan: args.allow_lan,
                require_node_token: true,
                max_request_bytes: args.max_request_bytes,
                max_context_tokens: args.max_context_tokens,
                allow_cloud: args.allow_cloud,
                private_mode: args.private_mode,
                redact_logs: args.redact_logs,
                audit_log_path: args.audit_log_path,
                rate_limit_per_minute: args.rate_limit_per_minute,
            };
            let state = ServerState::with_security(
                security,
                args.node_token,
                std::env::var("SAWYER_CLOUD_API_KEY").is_ok(),
            );

            println!("starting server on {}", args.bind);
            serve(&args.bind, state, args.unsafe_dev).await
        }
        Commands::Models(models) => match models.command {
            ModelsCommands::List => models_list(),
        },
    }
}

fn mode(args: ModeArgs) -> Result<()> {
    match args.command {
        ModeCommands::List => {
            for mode in RuntimeMode::all() {
                println!("{mode:11} {}", mode.description());
            }
            Ok(())
        }
        ModeCommands::Explain { mode } => {
            println!("{}", mode.explain());
            Ok(())
        }
        ModeCommands::Set { mode } => {
            save_mode(mode)?;
            println!("mode set to {mode}");
            Ok(())
        }
        ModeCommands::Current => {
            println!("{}", load_mode()?);
            Ok(())
        }
    }
}

fn doctor(args: DoctorArgs) -> Result<()> {
    match args.command {
        Some(DoctorCommands::Deps) => doctor_deps(),
        None => {
            let cpu = detect_cpu_features();
            let mut runtime = DeterministicRuntime::new(RuntimeConfig::default());
            runtime.step();
            println!("Sawyer doctor report");
            println!("- tick: {}", runtime.tick());
            println!(
                "- CPU avx2={} avx512f={} neon={}",
                cpu.avx2, cpu.avx512f, cpu.neon
            );
            println!("- mode: {}", load_mode()?);
            Ok(())
        }
    }
}

fn doctor_deps() -> Result<()> {
    let deps = [
        ("rust", true, "required"),
        (
            "llama.cpp",
            port_open("127.0.0.1:8081"),
            "optional provider",
        ),
        ("vLLM", port_open("127.0.0.1:8000"), "optional provider"),
        ("LiteLLM", port_open("127.0.0.1:4000"), "optional provider"),
        ("node/npm", false, "not required for single-binary runtime"),
    ];
    println!("Dependency | Status | Type");
    println!("-----------|--------|-----");
    for (dep, ok, kind) in deps {
        let status = if ok { "present" } else { "missing/disabled" };
        println!("{dep:10} | {status:14} | {kind}");
    }
    Ok(())
}

fn bench(args: BenchArgs) -> Result<()> {
    match args.command.unwrap_or(BenchCommands::Quick) {
        BenchCommands::Quick => bench_quick(),
        BenchCommands::Compare => bench_compare(),
    }
}

fn bench_quick() -> Result<()> {
    let mut out = Vec::new();

    let queue_start = Instant::now();
    let mut events = Vec::with_capacity(10_000);
    for i in 0..10_000 {
        events.push(i);
    }
    let queue_elapsed = queue_start.elapsed();
    out.push((
        "event_queue_ops_per_sec",
        10_000_f64 / queue_elapsed.as_secs_f64(),
    ));

    let reset_start = Instant::now();
    events.clear();
    let reset_elapsed = reset_start.elapsed();
    out.push(("arena_reset_ns", reset_elapsed.as_nanos() as f64));

    let lhs = vec![1.0_f32; 1024];
    let rhs = vec![2.0_f32; 1024];
    let dot_start = Instant::now();
    let dot = dot_product(&lhs, &rhs).map_err(anyhow::Error::msg)?;
    let dot_elapsed = dot_start.elapsed();
    out.push(("scalar_dot_ns", dot_elapsed.as_nanos() as f64));

    out.push(("provider_health_llama_ms", latency_ms("127.0.0.1:8081")));
    out.push(("provider_health_vllm_ms", latency_ms("127.0.0.1:8000")));
    out.push(("provider_health_litellm_ms", latency_ms("127.0.0.1:4000")));

    println!("bench quick (measured values only)");
    println!("dot_product_value={dot}");
    for (name, value) in out {
        println!("{name}={value:.2}");
    }
    println!("recommendation=use measured provider latency + mode policy; no synthetic claims");
    Ok(())
}

fn bench_compare() -> Result<()> {
    println!("provider | health_latency_ms");
    println!("llama.cpp | {:.2}", latency_ms("127.0.0.1:8081"));
    println!("vllm | {:.2}", latency_ms("127.0.0.1:8000"));
    println!("litellm | {:.2}", latency_ms("127.0.0.1:4000"));
    Ok(())
}

fn quickstart() -> Result<()> {
    let mode = load_mode()?;
    let hw = detect_hardware();
    let rec = recommend_model(&hw, "general");
    let compare = comparison(mode);

    println!("SawyerCore is a local-first AI runtime.");
    println!("It routes tasks deterministically with policy and audit visibility.");
    println!("Cloud is disabled by default; local providers are preferred.");
    println!("If no model is available, Sawyer stays truthful with degraded status.");
    println!("Current mode: {mode}");
    println!(
        "Recommended model: {} {}",
        rec.model_class, rec.quantization
    );
    println!("- execution path: {}", summarize_cpu_execution_path(cpu));
    Ok(())
}

fn bench_quick() -> Result<()> {
    let lhs = vec![1.0_f32; 256];
    let rhs = vec![2.0_f32; 256];
    let dot = dot_product(&lhs, &rhs).map_err(anyhow::Error::msg)?;
    println!("bench smoke: dot_product={dot}");
    println!("for full benches run: cargo bench -p sawyer-core");
    Ok(())
}

fn calibrate() -> Result<()> {
    let telemetry_path = default_telemetry_path();
    let events = TelemetryEngine::load_jsonl(&telemetry_path)?;
    let mut history = HistoryIndex::new(100);
    for event in events {
        history.push(event);
    }
    let providers = history.metrics_per_provider();

    println!("calibration profile");
    println!("- telemetry_file={}", telemetry_path.display());
    println!("- providers_seen={}", providers.len());
    for (provider, metrics) in providers {
        println!(
            "- provider={} p50_ms={} p95_ms={} throughput_rps={:.2}",
            provider, metrics.p50_latency_ms, metrics.p95_latency_ms, metrics.throughput_rps
        );
    }
    Ok(())
}

fn stats(args: StatsArgs) -> Result<()> {
    let telemetry_path = default_telemetry_path();
    let events = TelemetryEngine::load_jsonl(&telemetry_path)?;
    let mut history = HistoryIndex::new(100);
    for event in events {
        history.push(event);
    }

    match args.command {
        StatsCommands::Providers => {
            for (provider, metrics) in history.metrics_per_provider() {
                println!(
                    "{} samples={} avg_ms={} p50={} p95={} success={:.2} fail={:.2} timeout={:.2}",
                    provider,
                    metrics.samples,
                    metrics.avg_latency_ms,
                    metrics.p50_latency_ms,
                    metrics.p95_latency_ms,
                    metrics.success_rate,
                    metrics.failure_rate,
                    metrics.timeout_rate
                );
            }
        }
        StatsCommands::Tasks => {
            for (task, summary) in history.task_summaries() {
                println!(
                    "{} best={} worst={}",
                    task, summary.best_provider, summary.worst_provider
                );
            }
        }
        StatsCommands::Failures => {
            for (provider, metrics) in history.metrics_per_provider() {
                if metrics.failure_rate > 0.0 {
                    println!(
                        "{} fail_rate={:.2} timeout_rate={:.2}",
                        provider, metrics.failure_rate, metrics.timeout_rate
                    );
                }
            }
        }
    }

    Ok(())
}

fn explain_adaptive() -> Result<()> {
    let telemetry_path = default_telemetry_path();
    let events = TelemetryEngine::load_jsonl(&telemetry_path)?;
    let mut history = HistoryIndex::new(100);
    for event in events {
        history.push(event);
    }

    let explain = history.explain_adaptive("llama.cpp", "chat", &AdaptiveConfig::default());
    println!("adaptive explanation");
    println!("- changed={}", explain.changed);
    println!("- what_changed={}", explain.what_changed);
    println!("- why={}", explain.why);
    println!("- telemetry_basis={}", explain.telemetry_basis);
    println!("- confidence={:.2}", explain.confidence);
    Ok(())
}

fn load_mode() -> Result<RuntimeMode> {
    let path = state_dir().join(MODE_FILE);
    if !path.exists() {
        return Ok(DEFAULT_MODE);
    }
    let mode = fs::read_to_string(path)?.trim().to_string();
    parse_mode(&mode).with_context(|| format!("invalid saved mode value: {mode}"))
}

fn parse_mode(input: &str) -> Result<RuntimeMode> {
    match input {
        "tiny" => Ok(RuntimeMode::Tiny),
        "local" => Ok(RuntimeMode::Local),
        "performance" => Ok(RuntimeMode::Performance),
        "gateway" => Ok(RuntimeMode::Gateway),
        "dev" => Ok(RuntimeMode::Dev),
        _ => anyhow::bail!("unsupported mode: {input}"),
    }
}

fn port_open(addr: &str) -> bool {
    match addr.parse::<SocketAddr>() {
        Ok(socket) => TcpStream::connect_timeout(&socket, Duration::from_millis(80)).is_ok(),
        Err(_) => false,
    }
}

fn latency_ms(addr: &str) -> f64 {
    match addr.parse::<SocketAddr>() {
        Ok(socket) => {
            let start = Instant::now();
            if TcpStream::connect_timeout(&socket, Duration::from_millis(300)).is_ok() {
                start.elapsed().as_secs_f64() * 1000.0
            } else {
                -1.0
            }
        }
        Err(_) => -1.0,
    }
}

fn sim_run() -> Result<()> {
    let mut runner = ScenarioRunner::new(1234);
    runner.push_event(SimEvent {
        tick: 1,
        agent_id: 1,
        payload: "start".into(),
    });
    runner.push_event(SimEvent {
        tick: 2,
        agent_id: 1,
        payload: "step".into(),
    });

    let mut agents = vec![Agent::new(1)];
    let (replay, metrics) = runner.run(&mut agents);

    let mut telemetry = TelemetryEngine::new(TelemetryConfig {
        jsonl_path: default_telemetry_path(),
        rolling_window_size: 100,
        archive_path: None,
    })?;
    telemetry.record(RequestTelemetry {
        request_id: format!("sim-{}", replay.seed),
        timestamp_ms: replay.seed,
        task_type: "simulation".to_string(),
        input_size: replay.events.len(),
        selected_provider: "sim-local".to_string(),
        rejected_providers: vec![],
        latency_ms: metrics.latency_ms as u64,
        cost_usd_micros: Some(0),
        success: true,
        degraded: false,
        timeout: false,
        tokens_used: None,
        memory_snapshot: None,
        device_profile: None,
    })?;

    println!("sim run complete");
    println!("- seed: {}", replay.seed);
    println!("- events: {}", replay.events.len());
    println!("- latency_ms: {}", metrics.latency_ms);
    println!("- events_per_sec: {:.2}", metrics.events_per_sec);
    Ok(())
}

fn models_list() -> Result<()> {
    let state = ServerState::default();
    for model in &state.registry.models {
        println!(
            "{} backend={} available={} status={}",
            model.id, model.backend, model.available, model.status
        );
    }
    Ok(())
}

fn default_telemetry_path() -> PathBuf {
    PathBuf::from("./var/telemetry/requests.jsonl")
}
