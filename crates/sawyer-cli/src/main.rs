use anyhow::Result;
use clap::{Args, Parser, Subcommand};
use sawyer_core::{DeterministicRuntime, RuntimeConfig};
use sawyer_kernels::{detect_cpu_features, dot_product, summarize_cpu_execution_path};
use sawyer_server::{serve, SecurityConfig, ServerState};
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
    println!("- execution path: {}", summarize_cpu_execution_path(cpu));
    Ok(())
}

fn bench() -> Result<()> {
    let lhs = vec![1.0_f32; 256];
    let rhs = vec![2.0_f32; 256];
    let dot = dot_product(&lhs, &rhs).map_err(anyhow::Error::msg)?;
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
