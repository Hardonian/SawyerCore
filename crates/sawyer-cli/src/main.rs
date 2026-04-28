use std::{
    env, fmt, fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, Instant},
};

use anyhow::{Context, Result};
use clap::{Args, Parser, Subcommand};
use sawyer_core::{DeterministicRuntime, RuntimeConfig};
use sawyer_history::{AdaptiveConfig, HistoryIndex};
use sawyer_kernels::{detect_cpu_features, dot_product, summarize_cpu_execution_path};
use sawyer_server::{serve, SecurityConfig, ServerState};
use sawyer_sim::{Agent, ScenarioRunner, SimEvent};
use sawyer_telemetry::{RequestTelemetry, TelemetryConfig, TelemetryEngine};
use serde::{Deserialize, Serialize};

const MODE_FILE: &str = "mode";
const DEFAULT_MODE: RuntimeMode = RuntimeMode::Local;

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
    Doctor(DoctorArgs),
    Bench(BenchArgs),
    Calibrate,
    Stats(StatsArgs),
    Explain(ExplainArgs),
    Sim(SimArgs),
    Serve(ServeArgs),
    Sim(SimArgs),
    Models(ModelsArgs),
    Mode(ModeArgs),
    Quickstart,
    #[command(name = "first-run")]
    FirstRun,
    Security(SecurityArgs),
    #[command(name = "verify-binary")]
    VerifyBinary(VerifyBinaryArgs),
    Audit(AuditArgs),
    Smoke(SmokeArgs),
    Adaptive(AdaptiveArgs),
}

#[derive(Args)]
struct DoctorArgs {
    #[command(subcommand)]
    command: Option<DoctorCommands>,
}

#[derive(Subcommand)]
enum DoctorCommands {
    Deps,
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
    #[arg(long, default_value = "127.0.0.1:8090")]
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
struct SimArgs {
    #[command(subcommand)]
    command: SimCommands,
}

#[derive(Subcommand)]
enum SimCommands {
    Run,
}

#[derive(Args)]
struct ModelsArgs {
    #[command(subcommand)]
    command: SecurityCommands,
}

#[derive(Subcommand)]
enum ModelsCommands {
    ListLocal,
    Verify { path: PathBuf, sha256: String },
    Recommend,
}

#[derive(Args)]
struct ModeArgs {
    #[command(subcommand)]
    command: ModeCommands,
}

#[derive(Subcommand)]
enum ModeCommands {
    List,
    Explain { mode: RuntimeMode },
    Set { mode: RuntimeMode },
    Current,
}

#[derive(Args)]
struct SecurityArgs {
    #[command(subcommand)]
    command: SecurityCommands,
}

#[derive(Subcommand)]
enum SecurityCommands {
    Audit,
}

#[derive(Args)]
struct VerifyBinaryArgs {
    path: PathBuf,
    sha256: String,
}

#[derive(Args)]
struct AuditArgs {
    #[command(subcommand)]
    command: AuditCommands,
}

#[derive(Subcommand)]
enum AuditCommands {
    Verify { path: PathBuf },
}

#[derive(Args)]
struct SmokeArgs {
    #[command(subcommand)]
    command: SmokeCommands,
}

#[derive(Subcommand)]
enum SmokeCommands {
    Local,
}

#[derive(Args)]
struct AdaptiveArgs {
    #[command(subcommand)]
    command: AdaptiveCommands,
}

#[derive(Subcommand)]
enum AdaptiveCommands {
    Status,
    Explain,
    Reset,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, clap::ValueEnum, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum RuntimeMode {
    Tiny,
    Local,
    Performance,
    #[value(name = "cost-saver")]
    CostSaver,
    Private,
    Cluster,
    Developer,
}

impl RuntimeMode {
    fn description(self) -> &'static str {
        match self {
            Self::Tiny => {
                "CPU-only minimal footprint; local-only providers; smallest context budget"
            }
            Self::Local => {
                "Safe default: local-first routing; cloud disabled; strict degraded truth"
            }
            Self::Performance => "vLLM-first local performance profile with larger local budgets",
            Self::CostSaver => {
                "Local-first low-cost profile; cloud denied unless explicitly reconfigured"
            }
            Self::Private => "Hard private mode: cloud blocked, strict local execution only",
            Self::Cluster => {
                "Trusted-node cluster mode; localhost defaults, token-gated LAN control"
            }
            Self::Developer => {
                "Developer diagnostics with explicit unsafe knobs hidden behind flags"
            }
        }
    }

    fn all() -> &'static [RuntimeMode] {
        const MODES: [RuntimeMode; 7] = [
            RuntimeMode::Tiny,
            RuntimeMode::Local,
            RuntimeMode::Performance,
            RuntimeMode::CostSaver,
            RuntimeMode::Private,
            RuntimeMode::Cluster,
            RuntimeMode::Developer,
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
            Self::CostSaver => "cost-saver",
            Self::Private => "private",
            Self::Cluster => "cluster",
            Self::Developer => "developer",
        };
        write!(f, "{label}")
    }
}

#[derive(Debug, Clone)]
struct ProviderHealth {
    name: &'static str,
    endpoint: &'static str,
    available: bool,
    reason: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Doctor(args) => doctor(args),
        Commands::Bench(args) => match args.command {
            BenchCommands::Quick => bench_quick(),
            BenchCommands::Compare => bench_compare(),
        },
        Commands::Calibrate => calibrate(),
        Commands::Stats(args) => stats(args),
        Commands::Explain(args) => match args.command {
            ExplainCommands::Adaptive => explain_adaptive(),
        },
        Commands::Sim(args) => match args.command {
            SimCommands::Run => sim_run(),
        },
        Commands::Serve(args) => serve_cmd(args).await,
        Commands::Models(args) => models(args),
        Commands::Mode(args) => mode(args),
        Commands::Quickstart => quickstart(),
        Commands::FirstRun => first_run(),
        Commands::Security(args) => security(args),
        Commands::VerifyBinary(args) => verify_binary(args.path, &args.sha256),
        Commands::Audit(args) => audit(args),
        Commands::Smoke(args) => smoke(args),
        Commands::Adaptive(args) => adaptive(args),
    }
}

async fn serve_cmd(args: ServeArgs) -> Result<()> {
    if args.unsafe_dev {
        eprintln!("\n⚠️ UNSAFE DEV MODE ENABLED -- PRODUCTION SAFETY GUARDS RELAXED\n");
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
        env::var("SAWYER_CLOUD_API_KEY").is_ok(),
    );

    println!("starting server on {}", args.bind);
    serve(&args.bind, state, args.unsafe_dev).await
}

fn doctor(args: DoctorArgs) -> Result<()> {
    match args.command {
        Some(DoctorCommands::Deps) => {
            for p in provider_health() {
                let status = if p.available {
                    "available"
                } else {
                    "unavailable"
                };
                println!("{} {} ({}) - {}", p.name, status, p.endpoint, p.reason);
            }
            Ok(())
        }
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

fn bench_quick() -> Result<()> {
    let lhs = vec![1.0_f32; 1024];
    let rhs = vec![2.0_f32; 1024];
    let dot_start = Instant::now();
    let dot = dot_product(&lhs, &rhs).map_err(anyhow::Error::msg)?;
    let dot_elapsed = dot_start.elapsed();

    println!("bench quick (measured only)");
    println!("dot_product_value={dot}");
    println!("dot_ns={}", dot_elapsed.as_nanos());
    for p in provider_health() {
        let ms = latency_ms(p.endpoint);
        println!("provider_health_{}_ms={ms:.2}", p.name.replace('.', ""));
    }
    println!("recommendation=use measured provider latency + policy constraints");
    Ok(())
}

fn bench_compare() -> Result<()> {
    println!("provider | health_latency_ms");
    for p in provider_health() {
        println!("{} | {:.2}", p.name, latency_ms(p.endpoint));
    }
    Ok(())
}

fn quickstart() -> Result<()> {
    let mode = load_mode()?;
    println!("Sawyer quickstart");
    println!("- mode: {mode}");
    println!("- cloud disabled by default; private tasks are local-only");
    println!("- provider check: run `sawyer doctor deps`");
    println!("- model check: run `sawyer models list-local`");
    println!("- start server: `sawyer serve --bind 127.0.0.1:8080`");
    Ok(())
}

fn first_run() -> Result<()> {
    let cpu = detect_cpu_features();
    let mode = recommend_mode();
    let model = if mode == RuntimeMode::Tiny {
        "tiny pack (1.5B Q4_K_M gguf)"
    } else {
        "balanced pack (3B Q4_K_M gguf)"
    };

    println!("Sawyer first-run");
    println!("device detected: {}", summarize_cpu_execution_path(cpu));
    println!("recommended mode: {mode}");
    println!("recommended model: {model}");
    for p in provider_health() {
        println!(
            "provider {} available={} reason={}",
            p.name, p.available, p.reason
        );
    }
    println!("next command: sawyer mode set {mode}");
    Ok(())
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
            println!("{} => {}", mode, mode.description());
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

fn models(args: ModelsArgs) -> Result<()> {
    match args.command {
        ModelsCommands::ListLocal => models_list_local(),
        ModelsCommands::Verify { path, sha256 } => verify_binary(path, &sha256),
        ModelsCommands::Recommend => {
            println!("tiny pack: 1.5B gguf q4_k_m (cpu-safe)");
            println!("balanced pack: 3B gguf q4_k_m (default local)");
            println!("quality pack: 7B gguf q4_k_m (higher RAM)");
            println!("workstation pack: 14B gguf q4_k_m (workstation-class only)");
            Ok(())
        }
    }
}

fn models_list_local() -> Result<()> {
    let state = ServerState::default();
    for model in &state.registry.models {
        println!(
            "{} backend={} available={} status={}",
            model.id, model.backend, model.available, model.status
        );
    }
    cfg.version = target;

    write_json(&args.file, &cfg)?;
    println!("config migrated to version {}", cfg.version);
    Ok(())
}

fn security(args: SecurityArgs) -> Result<()> {
    match args.command {
        SecurityCommands::Audit => {
            let default = SecurityConfig::default();
            println!("security audit");
            println!("- bind_host={} (localhost-first)", default.bind_host);
            println!("- allow_lan={}", default.allow_lan);
            println!("- allow_cloud={}", default.allow_cloud);
            println!("- private_mode={}", default.private_mode);
            println!("- max_request_bytes={}", default.max_request_bytes);
            println!("- max_context_tokens={}", default.max_context_tokens);
            println!("- audit_log_path={}", default.audit_log_path);
            Ok(())
        }
    }
}

fn audit(args: AuditArgs) -> Result<()> {
    match args.command {
        AuditCommands::Verify { path } => verify_audit_chain(&path),
    }
}

fn smoke(args: SmokeArgs) -> Result<()> {
    match args.command {
        SmokeCommands::Local => {
            let status = Command::new("bash")
                .arg("scripts/smoke-local-stack.sh")
                .status()
                .context("failed to launch smoke script")?;
            if status.success() {
                println!("smoke local passed");
                Ok(())
            } else {
                anyhow::bail!("smoke local failed; check script output")
            }
        }
    }
}

fn adaptive(args: AdaptiveArgs) -> Result<()> {
    match args.command {
        AdaptiveCommands::Status => {
            let telemetry_path = default_telemetry_path();
            let events = TelemetryEngine::load_jsonl(&telemetry_path).unwrap_or_default();
            println!("adaptive status");
            println!("- telemetry_file={}", telemetry_path.display());
            println!("- events={}", events.len());
            Ok(())
        }
        AdaptiveCommands::Explain => explain_adaptive(),
        AdaptiveCommands::Reset => {
            let telemetry_path = default_telemetry_path();
            if telemetry_path.exists() {
                fs::remove_file(&telemetry_path)?;
            }
            println!("adaptive telemetry reset");
            Ok(())
        }
    }
}

fn verify_binary(path: PathBuf, sha256: &str) -> Result<()> {
    let output = Command::new("sha256sum")
        .arg(&path)
        .output()
        .with_context(|| format!("failed to execute sha256sum for {}", path.display()))?;
    if !output.status.success() {
        anyhow::bail!("sha256sum command failed for {}", path.display());
    }
    let stdout = String::from_utf8(output.stdout)?;
    let actual = stdout
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_string();
    if actual.eq_ignore_ascii_case(sha256) {
        println!("verified {}", path.display());
        Ok(())
    } else {
        anyhow::bail!(
            "checksum mismatch for {} expected={} actual={}",
            path.display(),
            sha256,
            actual
        )
    }
}

fn verify_audit_chain(path: &Path) -> Result<()> {
    let content = fs::read_to_string(path)
        .with_context(|| format!("unable to read audit log {}", path.display()))?;
    let mut lines = content.lines();
    let first = lines.next().unwrap_or_default();
    let mut valid = !first.is_empty();
    let mut count = usize::from(valid);
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        valid &= line.contains("event=") && line.contains("payload=");
        count += 1;
    }
    if valid {
        println!("audit verify ok lines={count}");
        Ok(())
    } else {
        anyhow::bail!("audit verify failed for {}", path.display())
    }
}

fn models_download(model_id: &str, yes: bool) -> Result<()> {
    let catalog = load_model_catalog()?;
    let model = find_model(&catalog, model_id)?;
    if !model.source_url.starts_with("https://") {
        bail!("refusing insecure URL for {model_id}; HTTPS is required");
    }
    if model.expected_sha256.len() != 64 {
        bail!("model {model_id} missing valid checksum metadata");
    }
    println!("Model license: {}", model.license);
    if !yes {
        println!("Refusing auto-download without explicit consent.");
        println!("Re-run with: sawyer models download {model_id} --yes");
        return Ok(());
    }

    let path = PathBuf::from(&model.default_local_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let status = Command::new("curl")
        .args([
            "--fail",
            "--location",
            "--proto",
            "=https",
            "--tlsv1.2",
            "-o",
        ])
        .arg(&path)
        .arg(&model.source_url)
        .status()
        .context("failed to execute curl; install curl and retry")?;

    if !status.success() {
        bail!("download failed for {model_id}; check network and URL");
    }

    let actual = sha256_file(&path)?;
    if actual != model.expected_sha256 {
        let _ = fs::remove_file(&path);
        bail!(
            "checksum mismatch for {model_id}; file deleted (expected {}, got {})",
            model.expected_sha256,
            actual
        );
    }
    println!("Downloaded and verified {} at {}", model_id, path.display());
    Ok(())
}

fn models_verify(model_id: &str) -> Result<()> {
    let catalog = load_model_catalog()?;
    let model = find_model(&catalog, model_id)?;
    let path = PathBuf::from(&model.default_local_path);
    if !path.exists() {
        bail!(
            "MODEL_MISSING: {}\nNext: sawyer models download {} --yes",
            path.display(),
            model_id
        );
    }
    let actual = sha256_file(&path)?;
    if actual != model.expected_sha256 {
        bail!("checksum mismatch for {model_id}");
    }
    println!("verified {}", model_id);
    Ok(())
}

fn models_list_local() -> Result<()> {
    let catalog = load_model_catalog()?;
    for model in catalog.models {
        let exists = Path::new(&model.default_local_path).exists();
        println!(
            "{} path={} present={} provider={} ctx={} size_bytes={} ram_gb={} tasks={}",
            model.id,
            model.default_local_path,
            exists,
            model.recommended_provider,
            model.context_limit,
            model.size_bytes,
            model.recommended_ram_gb,
            model.task_suitability.join(",")
        );
    }
    Ok(())
}

fn models_remove(model_id: &str) -> Result<()> {
    let catalog = load_model_catalog()?;
    let model = find_model(&catalog, model_id)?;
    let path = PathBuf::from(&model.default_local_path);
    if path.exists() {
        fs::remove_file(&path)?;
        println!("removed {}", path.display());
    } else {
        println!("nothing to remove; {} missing", path.display());
    }
    Ok(())
}

fn first_run(args: FirstRunArgs) -> Result<()> {
    let ram = detect_ram_gb();
    let arch = std::env::consts::ARCH;
    let os = std::env::consts::OS;
    let pack = if ram <= 6 {
        "tiny"
    } else if ram <= 12 {
        "balanced"
    } else if ram <= 32 {
        "quality-local"
    } else {
        "workstation"
    };
    let mode = if pack == "tiny" {
        "local-tiny"
    } else {
        "local-balanced"
    };

    write_local_config(&args.config, mode)?;
    let provider_ok = http_health("127.0.0.1", 8080, "/health");

    println!("1. Your device: os={os} arch={arch} ram_gb={ram}");
    println!("2. Recommended mode: {mode}");
    println!("3. Recommended model: {pack}");
    println!("4. Provider status: llama.cpp@127.0.0.1:8080 reachable={provider_ok}");
    if let Ok(cfg) = parse_local_config(&args.config) {
        if Path::new(&cfg.model_path).exists() {
            println!(
                "5. Next command: sawyer smoke local --config {}",
                args.config.display()
            );
        } else {
            println!(
                "5. Next command: sawyer models download {} --yes",
                cfg.model_id
            );
        }
    }
    Ok(())
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

fn cloud_blocked(host: &str, port: u16) -> Result<bool> {
    let body = r#"{"model":"cloud/test","messages":[{"role":"user","content":"private check"}]}"#;
    let raw = http_post(host, port, "/v1/chat/completions", body)?;
    Ok(raw.starts_with("HTTP/1.1 403"))
}

fn chat_call(host: &str, port: u16, model_id: &str) -> Result<bool> {
    let body = format!(
        "{{\"model\":\"{}\",\"messages\":[{{\"role\":\"user\",\"content\":\"smoke test\"}}]}}",
        model_id
    );
    let raw = http_post(host, port, "/v1/chat/completions", &body)?;
    Ok(raw.starts_with("HTTP/1.1 200") || raw.starts_with("HTTP/1.1 503"))
}

fn recommend_mode() -> RuntimeMode {
    let cpu = detect_cpu_features();
    if cpu.avx2 || cpu.neon {
        RuntimeMode::Local
    } else {
        RuntimeMode::Tiny
    }
}

fn load_mode() -> Result<RuntimeMode> {
    let path = state_dir().join(MODE_FILE);
    if !path.exists() {
        return Ok(DEFAULT_MODE);
    }
    let mode = fs::read_to_string(path)?.trim().to_string();
    parse_mode(&mode).with_context(|| format!("invalid saved mode value: {mode}"))
}

fn save_mode(mode: RuntimeMode) -> Result<()> {
    let dir = state_dir();
    fs::create_dir_all(&dir)?;
    fs::write(dir.join(MODE_FILE), mode.to_string())?;
    Ok(())
}

fn parse_mode(input: &str) -> Result<RuntimeMode> {
    match input {
        "tiny" => Ok(RuntimeMode::Tiny),
        "local" => Ok(RuntimeMode::Local),
        "performance" => Ok(RuntimeMode::Performance),
        "cost-saver" => Ok(RuntimeMode::CostSaver),
        "private" => Ok(RuntimeMode::Private),
        "cluster" => Ok(RuntimeMode::Cluster),
        "developer" => Ok(RuntimeMode::Developer),
        _ => anyhow::bail!("unsupported mode: {input}"),
    }
}

fn provider_health() -> Vec<ProviderHealth> {
    vec![
        provider_status("llama.cpp", "127.0.0.1:8080", check_llamacpp),
        provider_status("vllm", "127.0.0.1:8000", check_vllm),
        provider_status("litellm", "127.0.0.1:4000", check_litellm),
        ProviderHealth {
            name: "cloud",
            endpoint: "disabled-by-default",
            available: false,
            reason: "cloud provider remains disabled until explicitly configured".to_string(),
        },
    ]
}

fn provider_status(
    name: &'static str,
    endpoint: &'static str,
    checker: fn(&str) -> Result<()>,
) -> ProviderHealth {
    match checker(endpoint) {
        Ok(()) => ProviderHealth {
            name,
            endpoint,
            available: true,
            reason: "healthy".to_string(),
        },
        Err(err) => ProviderHealth {
            name,
            endpoint,
            available: false,
            reason: err.to_string(),
        },
    }
}

fn check_vllm(endpoint: &str) -> Result<()> {
    http_get_contains(endpoint, "/v1/models", "data")
}

fn check_litellm(endpoint: &str) -> Result<()> {
    http_get_contains(endpoint, "/v1/models", "data")
}

fn check_llamacpp(endpoint: &str) -> Result<()> {
    http_get_contains(endpoint, "/health", "ok")
}

fn http_get_contains(endpoint: &str, path: &str, needle: &str) -> Result<()> {
    let mut stream =
        TcpStream::connect(endpoint).with_context(|| format!("no server at {endpoint}"))?;
    stream.set_read_timeout(Some(Duration::from_millis(800)))?;
    stream.set_write_timeout(Some(Duration::from_millis(800)))?;
    let req = format!("GET {path} HTTP/1.1\r\nHost: {endpoint}\r\nConnection: close\r\n\r\n");
    stream.write_all(req.as_bytes())?;
    let mut buf = String::new();
    stream.read_to_string(&mut buf)?;
    if buf.starts_with("HTTP/1.1 200") || buf.starts_with("HTTP/1.0 200") {
        if buf.contains(needle) {
            Ok(())
        } else {
            anyhow::bail!("endpoint responded but missing expected marker '{needle}'")
        }
    } else {
        anyhow::bail!("unexpected HTTP response from {endpoint}")
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

fn state_dir() -> PathBuf {
    if let Ok(custom) = env::var("SAWYER_STATE_DIR") {
        return PathBuf::from(custom);
    }
    PathBuf::from(".sawyer")
}

fn default_telemetry_path() -> PathBuf {
    PathBuf::from("./var/telemetry/requests.jsonl")
}
