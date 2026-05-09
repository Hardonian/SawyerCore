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
    Doctor,
    Serve(ServeArgs),
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
    let state = ServerState::with_security(
        security,
        args.node_token,
        std::env::var("SAWYER_CLOUD_API_KEY").is_ok(),
    );
    println!("starting server on {}", args.bind);
    serve(&args.bind, state, false).await
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

fn state_dir() -> PathBuf {
    std::env::var("SAWYER_STATE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./.sawyer"))
}
