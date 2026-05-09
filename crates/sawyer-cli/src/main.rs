use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::{Args, Parser, Subcommand};
use sawyer_core::{DeterministicRuntime, EdgeRuntimeConfig, RuntimeConfig};
use sawyer_kb::Scope;
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
    Doctor(DoctorArgs),
    Bench(BenchArgs),
    Calibrate,
    Stats(StatsArgs),
    Explain(ExplainArgs),
    Sim(SimArgs),
    Serve(ServeArgs),
    Up(UpArgs),
    Sim(SimArgs),
    Kb(KbArgs),
    Plan(PlanArgs),
    Explain(ExplainArgs),
}

#[derive(Args)]
struct ServeArgs {
    #[arg(long, default_value = "127.0.0.1:8090")]
    bind: String,
    #[arg(long, default_value_t = false)]
    allow_lan: bool,
    #[arg(long, env = "SAWYER_NODE_TOKEN")]
    node_token: Option<String>,
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
        Commands::Doctor => doctor(),
        Commands::Serve(args) => serve_cmd(args).await,
        Commands::Up(args) => up_cmd(args).await,
        Commands::Sim(sim) => match sim.command {
            SimCommands::Run => sim_run(),
        },
        Commands::Kb(args) => kb_cmd(args),
        Commands::Plan(args) => plan_cmd(args),
        Commands::Explain(args) => explain_cmd(args),
    }
}

fn doctor() -> Result<()> {
    let mut runtime = DeterministicRuntime::new(RuntimeConfig::default());
    runtime.step();
    println!("Sawyer doctor report");
    println!("- tick: {}", runtime.tick());
    println!("- state_dir: {}", state_dir().display());
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
        Err(_) => -1.0,
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
fn state_dir() -> PathBuf {
    if let Ok(custom) = env::var("SAWYER_STATE_DIR") {
        return PathBuf::from(custom);
    }
    PathBuf::from(".sawyer")
}

fn default_telemetry_path() -> PathBuf {
    PathBuf::from("./var/telemetry/requests.jsonl")
}
