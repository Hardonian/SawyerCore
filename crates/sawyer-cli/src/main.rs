use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use clap::{Args, Parser, Subcommand};
use sawyer_core::{DeterministicRuntime, EdgeRuntimeConfig, RuntimeConfig};
use sawyer_kb::Scope;
use sawyer_llm::{LocalAdapter, Registry, UnavailableAdapter};
use sawyer_planner::{Planner, PlannerConfig};
use sawyer_server::{serve, SecurityConfig, ServerState};
use sawyer_sim::{Agent, ScenarioRunner, SimEvent};
use serde_json::Value;

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
    /// Run diagnostics on the local environment
    Doctor(DoctorArgs),
    /// Run benchmarks
    Bench(BenchArgs),
    /// Calibrate runtime parameters for local hardware
    Calibrate,
    /// Show runtime statistics
    Stats(StatsArgs),
    /// Explain the last routing decision
    Explain(ExplainArgs),
    /// Run a simulation scenario
    Sim(SimArgs),
    /// Start the HTTP API server
    Serve(ServeArgs),
    /// Start the full runtime using a local config
    Up(UpArgs),
    /// Knowledge base operations
    Kb(KbArgs),
    /// Generate an execution plan from a prompt
    Plan(PlanArgs),
    /// Interactive quickstart setup (not yet implemented)
    Quickstart,
    /// Manage runtime modes
    Mode(ModeArgs),
}

#[derive(Args)]
struct ServeArgs {
    #[arg(long, default_value = "127.0.0.1:8787")]
    bind: String,
    #[arg(long, default_value_t = false)]
    allow_lan: bool,
    #[arg(long, env = "SAWYER_NODE_TOKEN")]
    node_token: Option<String>,
    #[arg(long, default_value = "http://127.0.0.1:8080/v1")]
    provider_url: String,
    #[arg(long, default_value = "local-model")]
    model_id: String,
    #[arg(long, default_value_t = 1_048_576)]
    max_request_bytes: usize,
    #[arg(long, default_value_t = 8192)]
    max_context_tokens: usize,
    #[arg(long, default_value_t = false)]
    allow_cloud: bool,
    #[arg(long, default_value_t = true)]
    private_mode: bool,
    #[arg(long, default_value_t = true)]
    redact_logs: bool,
    #[arg(long, default_value = "./logs/sawyer-audit.jsonl")]
    audit_log_path: String,
    #[arg(long, default_value_t = 120)]
    rate_limit_per_minute: u32,
    #[arg(long, default_value_t = false)]
    unsafe_dev: bool,
}

#[derive(Args)]
struct ModeArgs {
    #[command(subcommand)]
    command: ModeCommands,
}

#[derive(Subcommand)]
enum ModeCommands {
    /// List available runtime modes
    List,
    /// Show details about a specific mode
    Explain { mode: String },
    /// Set the active runtime mode
    Set { mode: String },
    /// Show the current runtime mode
    Current,
}

#[derive(Args)]
struct DoctorArgs {}

#[derive(Args)]
struct BenchArgs {}

#[derive(Args)]
struct StatsArgs {}

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
struct KbArgs {
    #[command(subcommand)]
    command: KbCommands,
}

#[derive(Subcommand)]
enum KbCommands {
    Get { key: String },
    Set { key: String, value: String },
    List,
}

#[derive(Args)]
struct PlanArgs {
    input: String,
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

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Doctor(_) => doctor(),
        Commands::Bench(_) => {
            println!("bench: not yet implemented");
            println!("FIX: run `cargo bench -p sawyer-core --bench microbench` directly");
            Ok(())
        }
        Commands::Calibrate => {
            println!("calibrate: not yet implemented");
            Ok(())
        }
        Commands::Stats(_) => {
            println!("stats: not yet implemented");
            Ok(())
        }
        Commands::Serve(args) => serve_cmd(args).await,
        Commands::Up(args) => up_cmd(args).await,
        Commands::Sim(sim) => match sim.command {
            SimCommands::Run => sim_run(),
        },
        Commands::Kb(args) => kb_cmd(args),
        Commands::Plan(args) => plan_cmd(args),
        Commands::Explain(args) => explain_cmd(args),
        Commands::Quickstart => quickstart_cmd(),
        Commands::Mode(args) => mode_cmd(args),
    }
}

fn doctor() -> Result<()> {
    let mut runtime = DeterministicRuntime::new(RuntimeConfig::default());
    runtime.step();
    println!("Sawyer doctor report");
    println!("- tick: {}", runtime.tick());
    println!("- state_dir: {}", state_dir().display());
    println!("- rust_version: {}", env!("CARGO_PKG_VERSION"));
    Ok(())
}

fn quickstart_cmd() -> Result<()> {
    println!("sawyer quickstart");
    println!();
    println!("NOT YET IMPLEMENTED — interactive quickstart is planned.");
    println!();
    println!("Manual setup:");
    println!("  1. cp .env.example .env");
    println!("  2. cargo build --workspace");
    println!("  3. cargo run -p sawyer-cli -- serve");
    println!();
    println!("See QUICKSTART.md for full instructions.");
    Ok(())
}

fn mode_cmd(args: ModeArgs) -> Result<()> {
    match args.command {
        ModeCommands::List => {
            println!("Available runtime modes:");
            println!("  tiny         - Minimal resource footprint");
            println!("  local        - Balanced local processing");
            println!("  performance  - Maximum local performance");
            println!("  gateway      - Optimized for forwarding to remote providers");
            println!("  dev          - Development mode with extra logging");
            println!();
            println!("Set mode: sawyer mode set <mode>");
        }
        ModeCommands::Explain { mode } => {
            println!("mode explain {mode}: not yet implemented");
            println!("FIX: see docs/modes.md for mode details");
        }
        ModeCommands::Set { mode } => {
            println!("mode set {mode}: not yet implemented");
            println!("FIX: set SAWYER_MODE={mode} in .env and restart");
        }
        ModeCommands::Current => {
            let mode = env::var("SAWYER_MODE").unwrap_or_else(|_| "local-safe".to_string());
            println!("current mode: {mode}");
        }
    }
    Ok(())
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
        ..SecurityConfig::default()
    };
    let mut state = ServerState::with_security(
        security,
        args.node_token,
        env::var("SAWYER_CLOUD_API_KEY").is_ok(),
    );

    let provider = parse_host_port(&args.provider_url)?;
    if http_health(&provider.0, provider.1, "/health") {
        state.adapter = Arc::new(LlamaCppHttpAdapter::new(
            args.provider_url.clone(),
            args.model_id.clone(),
        ));
        state.registry = Registry {
            models: vec![ModelInfo {
                id: args.model_id,
                backend: "llama.cpp-http".to_string(),
                available: true,
                status: "healthy".to_string(),
            }],
        };
    } else {
        state.adapter = Arc::new(UnavailableAdapter);
        state.registry = Registry {
            models: vec![ModelInfo {
                id: args.model_id,
                backend: "llama.cpp-http".to_string(),
                available: false,
                status: "PROVIDER_UNAVAILABLE: start llama-server and retry".to_string(),
            }],
        };
    }

    println!("starting server on {}", args.bind);
    serve(&args.bind, state, false).await
}

async fn up_cmd(args: UpArgs) -> Result<()> {
    let cfg = parse_local_config(&args.config)?;
    println!("Starting Sawyer runtime using {}", args.config.display());
    if !Path::new(&cfg.model_path).exists() {
        println!("MODEL_MISSING: {}", cfg.model_path);
        println!(
            "Fix: sawyer models download {} --yes",
            pack_from_model_id(&cfg.model_id)
        );
    }

    let serve_args = ServeArgs {
        bind: cfg.router_bind,
        allow_lan: false,
        node_token: None,
        max_request_bytes: 1024 * 1024,
        max_context_tokens: 8192,
        allow_cloud: false,
        private_mode: true,
        redact_logs: true,
        audit_log_path: cfg.audit_log_path,
        rate_limit_per_minute: 120,
        unsafe_dev: false,
        provider_url: cfg.provider_url,
        model_id: cfg.model_id,
    };
    serve_cmd(serve_args).await
}

fn sim_run() -> Result<()> {
    let mut runner = ScenarioRunner::new(1234);
    runner.push_event(SimEvent {
        tick: 1,
        agent_id: 1,
        payload: "start".into(),
    });
    let mut agents = vec![Agent::new(1)];
    let (replay, metrics) = runner.run(&mut agents);
    println!(
        "sim run complete seed={} events={} eps={:.2}",
        replay.seed,
        replay.events.len(),
        metrics.events_per_sec
    );
    Ok(())
}

fn kb_cmd(args: KbArgs) -> Result<()> {
    let path = state_dir().join("kb.jsonl");
    let mut edge =
        sawyer_core::EdgeIntelligenceLayer::from_jsonl(&path, EdgeRuntimeConfig::default())?;
    match args.command {
        KbCommands::Get { key } => {
            if let Some(v) = edge.kb().get(&key) {
                println!("{}", serde_json::to_string_pretty(v)?);
            } else {
                println!("key not found: {key}");
            }
        }
        KbCommands::Set { key, value } => {
            let parsed: Value = serde_json::from_str(&value).unwrap_or(Value::String(value));
            let written = edge.kb_mut().set(&key, parsed, Scope::Session, 0.8);
            println!("set {key} accepted={written}");
        }
        KbCommands::List => {
            for item in edge.kb().list() {
                println!("{}={} scope={:?}", item.key, item.value, item.scope);
            }
        }
    }
    Ok(())
}

fn plan_cmd(args: PlanArgs) -> Result<()> {
    let planner = Planner::new(PlannerConfig::default());
    let plan = planner.create_plan(&args.input, false);
    let out = serde_json::to_string_pretty(&plan)?;
    fs::create_dir_all(state_dir())?;
    fs::write(state_dir().join("plan-last.json"), &out)?;
    println!("{out}");
    Ok(())
}

fn explain_cmd(args: ExplainArgs) -> Result<()> {
    match args.command {
        ExplainCommands::Last => {
            let path = state_dir().join("explain-last.json");
            if path.exists() {
                let text = fs::read_to_string(&path)
                    .with_context(|| format!("failed to read {}", path.display()))?;
                println!("{text}");
            } else {
                println!("no explanation found yet");
            }
        }
    }
    Ok(())
}

fn pack_from_model_id(model_id: &str) -> &'static str {
    if model_id.starts_with("tiny") {
        "tiny"
    } else if model_id.starts_with("balanced") {
        "balanced"
    } else {
        "quality"
    }
}

fn degraded_when_unavailable(host: &str, port: u16) -> Result<bool> {
    let body = r#"{"model":"local-missing","messages":[{"role":"user","content":"ping"}]}"#;
    let raw = http_post(host, port, "/v1/chat/completions", body)?;
    Ok(raw.starts_with("HTTP/1.1 503") || raw.starts_with("HTTP/1.1 500"))
}

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
fn state_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("SAWYER_STATE_DIR") {
        return PathBuf::from(custom);
    }
    PathBuf::from(".sawyer")
}

fn default_telemetry_path() -> PathBuf {
    PathBuf::from("./var/telemetry/requests.jsonl")
}
