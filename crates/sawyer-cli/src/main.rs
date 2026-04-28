use std::path::PathBuf;

use anyhow::Result;
use clap::{Args, Parser, Subcommand};
use sawyer_core::{DeterministicRuntime, RuntimeConfig};
use sawyer_history::{AdaptiveConfig, HistoryIndex};
use sawyer_kernels::{detect_cpu_features, dot_product};
use sawyer_server::{serve, ServerState};
use sawyer_sim::{Agent, ScenarioRunner, SimEvent};
use sawyer_telemetry::{RequestTelemetry, TelemetryConfig, TelemetryEngine};

#[derive(Parser)]
#[command(name = "sawyer", about = "SawyerCore deterministic edge runtime CLI")]
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
            println!("starting server on {}", args.bind);
            serve(&args.bind, ServerState::default()).await
        }
        Commands::Models(models) => match models.command {
            ModelsCommands::List => models_list(),
        },
    }
}

fn doctor() -> Result<()> {
    let cpu = detect_cpu_features();
    let mut runtime = DeterministicRuntime::new(RuntimeConfig::default());
    runtime.step();
    println!("Sawyer doctor report");
    println!("- tick: {}", runtime.tick());
    println!(
        "- CPU avx2={} avx512f={} neon={}",
        cpu.avx2, cpu.avx512f, cpu.neon
    );
    Ok(())
}

fn bench_quick() -> Result<()> {
    let lhs = vec![1.0_f32; 256];
    let rhs = vec![2.0_f32; 256];
    let dot = dot_product(&lhs, &rhs)?;
    println!("bench quick: dot_product={dot}");
    Ok(())
}

fn bench_compare() -> Result<()> {
    let lhs = vec![1.0_f32; 1024];
    let rhs = vec![1.0_f32; 1024];
    let baseline = dot_product(&lhs, &rhs)?;
    let candidate = dot_product(&lhs, &rhs)?;
    println!("bench compare");
    println!("- baseline_dot={baseline}");
    println!("- candidate_dot={candidate}");
    println!("- delta={:.4}", candidate - baseline);
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
