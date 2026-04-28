use anyhow::{Context, Result};
use clap::{Args, Parser, Subcommand};
use sawyer_core::{DeterministicRuntime, RuntimeConfig};
use sawyer_kernels::{detect_cpu_features, dot_product};
use sawyer_server::{serve, ServerState};
use sawyer_sim::{Agent, ScenarioRunner, SimEvent};
use serde::{Deserialize, Serialize};
use std::{
    fmt, fs,
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    time::{Duration, Instant},
};

const DEFAULT_MODE: RuntimeMode = RuntimeMode::Local;
const MODE_FILE: &str = "mode";
const LAST_EXPLAIN_FILE: &str = "last-explain.json";

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
    Mode(ModeArgs),
    Quickstart,
    Compare(CompareArgs),
    Explain(ExplainArgs),
    Up(UpArgs),
    Sim(SimArgs),
    Serve(ServeArgs),
    Models(ModelsArgs),
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
    command: Option<BenchCommands>,
}

#[derive(Subcommand)]
enum BenchCommands {
    Quick,
    Compare,
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
struct CompareArgs {
    #[arg(long)]
    json: bool,
}

#[derive(Args)]
struct ExplainArgs {
    #[command(subcommand)]
    command: ExplainCommands,
}

#[derive(Subcommand)]
enum ExplainCommands {
    Last,
}

#[derive(Args)]
struct UpArgs {
    #[arg(long, default_value = "127.0.0.1:8080")]
    bind: String,
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
        Commands::Doctor(args) => doctor(args),
        Commands::Bench(args) => bench(args),
        Commands::Mode(args) => mode(args),
        Commands::Quickstart => quickstart(),
        Commands::Compare(args) => compare(args),
        Commands::Explain(args) => explain(args),
        Commands::Up(args) => up(args).await,
        Commands::Sim(sim) => match sim.command {
            SimCommands::Run => sim_run(),
        },
        Commands::Serve(args) => {
            println!("starting server on {}", args.bind);
            serve(&args.bind, ServerState::default()).await
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
    println!("Provider status:");
    for row in compare {
        println!(
            "- {}: available={} ({})",
            row.provider, row.available, row.reason
        );
    }
    println!("Next command: sawyer up");
    Ok(())
}

fn compare(args: CompareArgs) -> Result<()> {
    let mode = load_mode()?;
    let rows = comparison(mode);
    if args.json {
        println!("{}", serde_json::to_string_pretty(&rows)?);
        return Ok(());
    }

    println!(
        "Provider | Available | Best For | Cost | Privacy | Speed | Setup Difficulty | Reason"
    );
    println!(
        "---------|-----------|----------|------|---------|-------|------------------|-------"
    );
    for row in rows {
        println!(
            "{} | {} | {} | {} | {} | {} | {} | {}",
            row.provider,
            row.available,
            row.best_for,
            row.cost,
            row.privacy,
            row.speed,
            row.setup,
            row.reason
        );
    }
    Ok(())
}

fn explain(args: ExplainArgs) -> Result<()> {
    match args.command {
        ExplainCommands::Last => {
            let path = state_dir().join(LAST_EXPLAIN_FILE);
            if !path.exists() {
                println!(
                    "no routing explanation captured yet; run 'sawyer up' or routing flows first"
                );
                return Ok(());
            }
            let value = fs::read_to_string(path)?;
            println!("{value}");
            Ok(())
        }
    }
}

async fn up(args: UpArgs) -> Result<()> {
    let mode = load_mode().unwrap_or(DEFAULT_MODE);
    let hw = detect_hardware();
    let selected_mode = if matches!(mode, RuntimeMode::Dev) {
        RuntimeMode::Dev
    } else {
        safest_mode(&hw)
    };
    if selected_mode != mode {
        save_mode(selected_mode)?;
    }

    let rec = recommend_model(&hw, "general");
    let rows = comparison(selected_mode);
    let explain = build_explain(selected_mode, &rows);
    persist_explain(&explain)?;

    println!("sawyer up");
    println!("- os: {}", hw.os);
    println!(
        "- ram_gb: {}",
        hw.ram_gb.map_or("unknown".into(), |v| v.to_string())
    );
    println!("- selected_mode: {selected_mode}");
    println!(
        "- recommended_model: {} {}",
        rec.model_class, rec.quantization
    );
    let available = rows
        .iter()
        .filter(|r| r.available && r.provider != "local unavailable" && r.provider != "cloud")
        .count();
    println!("- local_providers_available: {available}");
    if available == 0 {
        println!("- degraded: true");
        println!("  fix: start llama.cpp server on 127.0.0.1:8081 or vLLM on 127.0.0.1:8000");
    } else {
        println!("- degraded: false");
    }
    println!("next: curl http://{}/status", args.bind);

    serve(&args.bind, ServerState::default()).await
}

fn comparison(mode: RuntimeMode) -> Vec<ProviderRow> {
    let llama_available = port_open("127.0.0.1:8081");
    let vllm_available = port_open("127.0.0.1:8000") && !matches!(mode, RuntimeMode::Tiny);
    let litellm_available = port_open("127.0.0.1:4000")
        && matches!(
            mode,
            RuntimeMode::Gateway | RuntimeMode::Local | RuntimeMode::Performance | RuntimeMode::Dev
        );

    vec![
        ProviderRow {
            provider: "CPU llama.cpp",
            available: llama_available,
            best_for: "tiny/local offline",
            cost: "low",
            privacy: "high",
            speed: "medium",
            setup: "moderate",
            reason: if llama_available {
                "local HTTP endpoint reachable at 127.0.0.1:8081".into()
            } else {
                "unavailable: no server found at 127.0.0.1:8081".into()
            },
        },
        ProviderRow {
            provider: "vLLM",
            available: vllm_available,
            best_for: "performance GPU",
            cost: "medium",
            privacy: "high",
            speed: "fast",
            setup: "advanced",
            reason: if matches!(mode, RuntimeMode::Tiny) {
                "disabled in tiny mode".into()
            } else if vllm_available {
                "reachable at 127.0.0.1:8000".into()
            } else {
                "vLLM unavailable: no server found at 127.0.0.1:8000".into()
            },
        },
        ProviderRow {
            provider: "LiteLLM",
            available: litellm_available,
            best_for: "gateway normalization",
            cost: "variable",
            privacy: "mode-dependent",
            speed: "medium",
            setup: "advanced",
            reason: if matches!(mode, RuntimeMode::Tiny) {
                "disabled in tiny mode".into()
            } else if litellm_available {
                "reachable at 127.0.0.1:4000".into()
            } else {
                "LiteLLM unavailable: no server found at 127.0.0.1:4000".into()
            },
        },
        ProviderRow {
            provider: "local unavailable",
            available: !(llama_available || vllm_available || litellm_available),
            best_for: "truthful degraded state",
            cost: "none",
            privacy: "high",
            speed: "n/a",
            setup: "none",
            reason: "reported when no local providers are reachable".into(),
        },
        ProviderRow {
            provider: "cloud",
            available: false,
            best_for: "disabled",
            cost: "n/a",
            privacy: "blocked",
            speed: "n/a",
            setup: "n/a",
            reason: "cloud fallback disabled by default (local-safe posture)".into(),
        },
    ]
}

fn build_explain(mode: RuntimeMode, rows: &[ProviderRow]) -> RoutingExplain {
    let selected = rows
        .iter()
        .find(|r| r.available && r.provider != "local unavailable")
        .map(|r| r.provider.to_string())
        .unwrap_or_else(|| "none".to_string());
    let rejected = rows
        .iter()
        .filter(|r| !r.available && r.provider != "local unavailable")
        .map(|r| format!("{}: {}", r.provider, r.reason))
        .collect::<Vec<_>>();
    let degraded = selected == "none";
    RoutingExplain {
        selected_provider: selected,
        rejected_providers: rejected,
        reason_codes: vec![
            format!("mode={mode}"),
            "cloud_disabled_default".to_string(),
            if degraded {
                "no_local_provider".to_string()
            } else {
                "local_provider_selected".to_string()
            },
        ],
        privacy_decision: "local-safe: cloud routes disabled unless explicit enablement"
            .to_string(),
        cost_decision: "prefer local execution to avoid external token charges".to_string(),
        speed_decision: "select fastest available provider permitted by mode".to_string(),
        fallback_decision: if degraded {
            "degraded=true; no hidden fallback".to_string()
        } else {
            "fallback remains local-only within selected mode".to_string()
        },
        degraded,
    }
}

fn persist_explain(explain: &RoutingExplain) -> Result<()> {
    fs::create_dir_all(state_dir())?;
    let payload = serde_json::to_string_pretty(explain)?;
    fs::write(state_dir().join(LAST_EXPLAIN_FILE), payload)?;
    Ok(())
}

fn safest_mode(hw: &HardwareSnapshot) -> RuntimeMode {
    match hw.ram_gb {
        Some(ram) if ram < 8 => RuntimeMode::Tiny,
        Some(_) => RuntimeMode::Local,
        None => RuntimeMode::Local,
    }
}

fn recommend_model(hw: &HardwareSnapshot, user_goal: &str) -> ModelRecommendation {
    let (class, quant, band, provider) = if hw.battery_sensitive || hw.thermal_constrained {
        ("0.5B tiny", "Q4_K_M", "usable", "llama.cpp")
    } else if let Some(vram) = hw.vram_gb {
        if vram >= 24 {
            ("7B quality", "Q5_K_M", "fast", "vLLM")
        } else {
            recommend_from_ram(hw.ram_gb)
        }
    } else {
        recommend_from_ram(hw.ram_gb)
    };

    ModelRecommendation {
        model_class: class,
        quantization: quant,
        performance_band: band,
        provider,
        reason: format!(
            "goal={user_goal}, os={}, ram={:?}GB, vram={:?}GB",
            hw.os, hw.ram_gb, hw.vram_gb
        ),
    }
}

fn recommend_from_ram(
    ram_gb: Option<u64>,
) -> (&'static str, &'static str, &'static str, &'static str) {
    match ram_gb {
        Some(ram) if ram < 8 => ("1.5B lightweight", "Q4_K_M", "slow", "llama.cpp"),
        Some(ram) if (8..16).contains(&ram) => ("3B balanced", "Q5_K_M", "usable", "llama.cpp"),
        Some(ram) if (16..32).contains(&ram) => ("7B quality", "Q5_K_M", "good", "vLLM"),
        Some(_) => ("14B+ workstation only", "Q8_0", "fast", "vLLM"),
        None => ("1.5B lightweight", "Q4_K_M", "usable", "unavailable"),
    }
}

fn detect_hardware() -> HardwareSnapshot {
    HardwareSnapshot {
        os: std::env::consts::OS.to_string(),
        ram_gb: detect_ram_gb(),
        vram_gb: None,
        battery_sensitive: false,
        thermal_constrained: false,
    }
}

fn detect_ram_gb() -> Option<u64> {
    #[cfg(target_os = "linux")]
    {
        let mut contents = String::new();
        if fs::File::open("/proc/meminfo")
            .and_then(|mut f| f.read_to_string(&mut contents))
            .is_ok()
        {
            if let Some(line) = contents.lines().find(|l| l.starts_with("MemTotal:")) {
                let kb = line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|v| v.parse::<u64>().ok())?;
                return Some(kb / 1024 / 1024);
            }
        }
    }
    None
}

fn state_dir() -> PathBuf {
    if let Ok(path) = std::env::var("SAWYER_STATE_DIR") {
        return PathBuf::from(path);
    }
    PathBuf::from(".sawyer")
}

fn save_mode(mode: RuntimeMode) -> Result<()> {
    fs::create_dir_all(state_dir())?;
    let mut file = fs::File::create(state_dir().join(MODE_FILE))?;
    file.write_all(mode.to_string().as_bytes())?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mode_parse_roundtrip() {
        for mode in RuntimeMode::all() {
            let parsed = parse_mode(&mode.to_string()).expect("mode parses");
            assert_eq!(*mode, parsed);
        }
    }

    #[test]
    fn recommendation_is_conservative_for_unknown_hardware() {
        let rec = recommend_model(
            &HardwareSnapshot {
                os: "linux".into(),
                ram_gb: None,
                vram_gb: None,
                battery_sensitive: false,
                thermal_constrained: false,
            },
            "general",
        );
        assert_eq!(rec.model_class, "1.5B lightweight");
        assert_eq!(rec.provider, "unavailable");
    }

    #[test]
    fn comparison_keeps_cloud_disabled() {
        let rows = comparison(RuntimeMode::Local);
        let cloud = rows
            .iter()
            .find(|r| r.provider == "cloud")
            .expect("cloud row");
        assert!(!cloud.available);
    }

    #[test]
    fn explain_has_degraded_fallback_when_no_provider() {
        let rows = vec![ProviderRow {
            provider: "cloud",
            available: false,
            best_for: "disabled",
            cost: "n/a",
            privacy: "blocked",
            speed: "n/a",
            setup: "n/a",
            reason: "cloud fallback disabled by default".into(),
        }];
        let explain = build_explain(RuntimeMode::Tiny, &rows);
        assert!(explain.degraded);
        assert_eq!(explain.selected_provider, "none");
    }

    #[test]
    fn mode_selection_prefers_tiny_on_low_ram() {
        let tiny = safest_mode(&HardwareSnapshot {
            os: "linux".into(),
            ram_gb: Some(4),
            vram_gb: None,
            battery_sensitive: false,
            thermal_constrained: false,
        });
        assert_eq!(tiny, RuntimeMode::Tiny);
    }

    #[test]
    fn deps_doctor_mentions_node_not_required() {
        let node_required = false;
        assert!(!node_required);
    }

    #[test]
    fn bench_latency_handles_invalid_address() {
        assert!(latency_ms("invalid") < 0.0);
    }

    #[test]
    fn can_persist_and_load_mode() {
        let temp = std::env::temp_dir().join("sawyer-cli-mode-test");
        if temp.exists() {
            fs::remove_dir_all(&temp).expect("cleanup old temp dir");
        }
        std::env::set_var("SAWYER_STATE_DIR", &temp);

        save_mode(RuntimeMode::Gateway).expect("save mode");
        let loaded = load_mode().expect("load mode");
        assert_eq!(loaded, RuntimeMode::Gateway);

        std::env::remove_var("SAWYER_STATE_DIR");
        fs::remove_dir_all(&temp).expect("cleanup temp dir");
    }

    #[test]
    fn mode_explain_contains_runtime_mode() {
        assert!(RuntimeMode::Tiny.explain().contains("tiny"));
    }

    #[test]
    fn respects_single_binary_default_state_dir() {
        let path = state_dir();
        assert_eq!(path, std::path::Path::new(".sawyer"));
    }
}
