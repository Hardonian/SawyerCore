use anyhow::Result;
use clap::{Args, Parser, Subcommand};
use sawyer_core::{DeterministicRuntime, RuntimeConfig};
use sawyer_kernels::{detect_cpu_features, dot_product};
use sawyer_server::{serve, ServerState};
use sawyer_sim::{Agent, ScenarioRunner, SimEvent};

#[derive(Parser)]
#[command(name = "sawyer", about = "SawyerCore deterministic edge runtime CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Doctor,
    Bench,
    Sim(SimArgs),
    Serve(ServeArgs),
    Models(ModelsArgs),
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
        Commands::Bench => bench(),
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

fn bench() -> Result<()> {
    let lhs = vec![1.0_f32; 256];
    let rhs = vec![2.0_f32; 256];
    let dot = dot_product(&lhs, &rhs)?;
    println!("bench smoke: dot_product={dot}");
    println!("for full benches run: cargo bench -p sawyer-core");
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
