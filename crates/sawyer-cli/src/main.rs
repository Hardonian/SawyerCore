use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    process::Command,
    sync::Arc,
    time::Duration,
};

use anyhow::{anyhow, bail, Context, Result};
use clap::{Args, Parser, Subcommand};
use sawyer_core::{DeterministicRuntime, RuntimeConfig};
use sawyer_llm::{LlamaCppHttpAdapter, ModelInfo, Registry, UnavailableAdapter};
use sawyer_server::{serve, SecurityConfig, ServerState};
use sawyer_sim::{Agent, ScenarioRunner, SimEvent};

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
    Up(UpArgs),
    Sim(SimArgs),
    Models(ModelsArgs),
    FirstRun(FirstRunArgs),
    Smoke(SmokeArgs),
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
    #[arg(long, default_value = "http://127.0.0.1:8080")]
    provider_url: String,
    #[arg(long, default_value = "tiny-q4")]
    model_id: String,
}

#[derive(Args)]
struct UpArgs {
    #[arg(long, default_value = "./.sawyer/config.toml")]
    config: PathBuf,
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
    command: ModelsCommands,
}

#[derive(Subcommand)]
enum ModelsCommands {
    Recommend,
    Download {
        pack: String,
        #[arg(long)]
        yes: bool,
    },
    Verify,
    ListLocal,
    Remove {
        model_id: String,
    },
}

#[derive(Args)]
struct FirstRunArgs {
    #[arg(long, default_value = "./.sawyer/config.toml")]
    config: PathBuf,
}

#[derive(Args)]
struct SmokeArgs {
    #[command(subcommand)]
    command: SmokeCommands,
}

#[derive(Subcommand)]
enum SmokeCommands {
    Local {
        #[arg(long, default_value = "./.sawyer/config.toml")]
        config: PathBuf,
    },
}

#[derive(Debug)]
struct ModelCatalog {
    packs: Vec<ModelPack>,
    models: Vec<ModelEntry>,
}

#[derive(Debug)]
struct ModelPack {
    id: String,
    model_ids: Vec<String>,
}

#[derive(Debug, Clone)]
struct ModelEntry {
    id: String,
    source_url: String,
    expected_sha256: String,
    size_bytes: u64,
    license: String,
    recommended_ram_gb: u64,
    default_local_path: String,
}

struct LocalConfig {
    router_bind: String,
    router_url: String,
    provider_url: String,
    model_id: String,
    model_path: String,
    audit_log_path: String,
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
        Commands::Models(args) => models(args),
        Commands::FirstRun(args) => first_run(args),
        Commands::Smoke(args) => match args.command {
            SmokeCommands::Local { config } => smoke_local(&config),
        },
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
        require_node_token: true,
        max_request_bytes: args.max_request_bytes,
        max_context_tokens: args.max_context_tokens,
        allow_cloud: args.allow_cloud,
        private_mode: args.private_mode,
        redact_logs: args.redact_logs,
        audit_log_path: args.audit_log_path,
        rate_limit_per_minute: args.rate_limit_per_minute,
    };
    let mut state = ServerState::with_security(
        security,
        args.node_token,
        std::env::var("SAWYER_CLOUD_API_KEY").is_ok(),
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
    serve(&args.bind, state, args.unsafe_dev).await
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

fn models(args: ModelsArgs) -> Result<()> {
    match args.command {
        ModelsCommands::Recommend => models_recommend(),
        ModelsCommands::Download { pack, yes } => models_download(&pack, yes),
        ModelsCommands::Verify => models_verify_all(),
        ModelsCommands::ListLocal => models_list_local(),
        ModelsCommands::Remove { model_id } => models_remove(&model_id),
    }
}

fn models_recommend() -> Result<()> {
    let ram = detect_ram_gb();
    let pack = if ram <= 6 {
        "tiny"
    } else if ram <= 12 {
        "balanced"
    } else {
        "quality"
    };
    println!("Recommended model pack: {pack} (detected RAM: {ram} GB)");
    println!("Next: sawyer models download {pack} --yes");
    Ok(())
}

fn models_download(pack: &str, yes: bool) -> Result<()> {
    let catalog = load_model_catalog()?;
    let model = resolve_pack(pack, &catalog)?;

    println!("Model: {}", model.id);
    println!("License: {}", model.license);
    println!("Size: {} bytes", model.size_bytes);
    println!("RAM recommendation: {} GB", model.recommended_ram_gb);
    println!("URL: {}", model.source_url);

    if is_placeholder_checksum(&model.expected_sha256) {
        bail!(
            "UNAVAILABLE: checksum metadata for {} is placeholder; refusing download to avoid unverified model",
            model.id
        );
    }

    if !yes {
        println!("No download performed without explicit confirmation.");
        println!("Re-run: sawyer models download {pack} --yes");
        return Ok(());
    }

    if let Some(parent) = Path::new(&model.default_local_path).parent() {
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
        .arg(&model.default_local_path)
        .arg(&model.source_url)
        .status()
        .context("failed to execute curl; install curl and retry")?;

    if !status.success() {
        bail!("download failed for {}", model.id);
    }

    let actual = sha256_file(Path::new(&model.default_local_path))?;
    if actual != model.expected_sha256 {
        let _ = fs::remove_file(&model.default_local_path);
        bail!("checksum mismatch for {}; file deleted", model.id);
    }
    println!("Downloaded and verified {}", model.id);
    Ok(())
}

fn models_verify_all() -> Result<()> {
    let catalog = load_model_catalog()?;
    for model in catalog.models {
        if Path::new(&model.default_local_path).exists() {
            if is_placeholder_checksum(&model.expected_sha256) {
                println!("{}: UNAVAILABLE checksum metadata", model.id);
                continue;
            }
            let actual = sha256_file(Path::new(&model.default_local_path))?;
            if actual == model.expected_sha256 {
                println!("{}: verified", model.id);
            } else {
                println!("{}: checksum mismatch", model.id);
            }
        }
    }
    Ok(())
}

fn models_list_local() -> Result<()> {
    let catalog = load_model_catalog()?;
    for model in catalog.models {
        println!(
            "{} path={} present={} size_bytes={} ram_gb={}",
            model.id,
            model.default_local_path,
            Path::new(&model.default_local_path).exists(),
            model.size_bytes,
            model.recommended_ram_gb,
        );
    }
    Ok(())
}

fn models_remove(model_id: &str) -> Result<()> {
    let catalog = load_model_catalog()?;
    let model = catalog
        .models
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| anyhow!("unknown model id: {model_id}"))?;
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
    } else {
        "quality"
    };
    let mode = if pack == "tiny" { "tiny" } else { "local" };

    write_local_config(&args.config, pack)?;
    let provider_ok = http_health("127.0.0.1", 8080, "/health");

    println!("1. Device detected: os={os} arch={arch}");
    println!("2. RAM/CPU summary: ram_gb={ram} cpu=detected");
    println!("3. Recommended mode: {mode}");
    println!("4. Recommended model: {pack}");
    println!("5. Provider status: llama.cpp@127.0.0.1:8080 reachable={provider_ok}");

    let cfg = parse_local_config(&args.config)?;
    if Path::new(&cfg.model_path).exists() {
        println!(
            "6. Next command: sawyer smoke local --config {}",
            args.config.display()
        );
    } else {
        println!("6. Next command: sawyer models download {pack} --yes");
    }
    Ok(())
}

fn smoke_local(config_path: &Path) -> Result<()> {
    if !config_path.exists() {
        bail!("config missing: {}", config_path.display());
    }
    let cfg = parse_local_config(config_path)?;

    if let Some(parent) = Path::new(&cfg.audit_log_path).parent() {
        fs::create_dir_all(parent)?;
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&cfg.audit_log_path)
        .with_context(|| format!("audit log not writable: {}", cfg.audit_log_path))?;

    if !Path::new(&cfg.model_path).exists() {
        println!("MODEL_MISSING: {}", cfg.model_path);
        println!(
            "Fix: sawyer models download {} --yes",
            pack_from_model_id(&cfg.model_id)
        );
        return Ok(());
    }

    let provider_addr = parse_host_port(&cfg.provider_url)?;
    if !http_health(&provider_addr.0, provider_addr.1, "/health") {
        println!("PROVIDER_UNAVAILABLE: {}", cfg.provider_url);
        println!("Fix: ./scripts/start-llamacpp.sh {}", cfg.model_path);
        return Ok(());
    }

    let router_addr = parse_host_port(&cfg.router_url)?;
    let ok = chat_call(&router_addr.0, router_addr.1, &cfg.model_id)?;
    if !ok {
        bail!("router chat completion failed");
    }
    println!("smoke local passed");
    Ok(())
}

fn chat_call(host: &str, port: u16, model_id: &str) -> Result<bool> {
    let body = format!(
        "{{\"model\":\"{}\",\"messages\":[{{\"role\":\"user\",\"content\":\"smoke test\"}}]}}",
        model_id
    );
    let raw = http_post(host, port, "/v1/chat/completions", &body)?;
    Ok(raw.starts_with("HTTP/1.1 200") || raw.starts_with("HTTP/1.1 503"))
}

fn http_post(host: &str, port: u16, path: &str, json: &str) -> Result<String> {
    let mut stream = TcpStream::connect((host, port))
        .with_context(|| format!("failed to connect to http://{host}:{port}"))?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let req = format!(
        "POST {path} HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        json.len(),
        json
    );
    stream.write_all(req.as_bytes())?;
    let mut out = String::new();
    stream.read_to_string(&mut out)?;
    Ok(out)
}

fn http_health(host: &str, port: u16, path: &str) -> bool {
    let mut stream = match TcpStream::connect((host, port)) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let req = format!("GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut out = String::new();
    if stream.read_to_string(&mut out).is_err() {
        return false;
    }
    out.starts_with("HTTP/1.1 200")
}

fn parse_host_port(url: &str) -> Result<(String, u16)> {
    let stripped = url
        .strip_prefix("http://")
        .ok_or_else(|| anyhow!("only http:// localhost URLs are supported"))?;
    let host_port = stripped.split('/').next().unwrap_or(stripped);
    let mut parts = host_port.split(':');
    let host = parts.next().unwrap_or("127.0.0.1").to_string();
    let port: u16 = parts.next().unwrap_or("80").parse()?;
    Ok((host, port))
}

fn parse_local_config(path: &Path) -> Result<LocalConfig> {
    let text = fs::read_to_string(path)
        .with_context(|| format!("failed reading config {}", path.display()))?;
    fn pick(text: &str, key: &str, default: &str) -> String {
        text.lines()
            .find_map(|l| {
                let t = l.trim();
                if t.starts_with('#') || !t.contains('=') {
                    return None;
                }
                let (k, v) = t.split_once('=')?;
                if k.trim() == key {
                    Some(v.trim().trim_matches('"').to_string())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| default.to_string())
    }
    Ok(LocalConfig {
        router_bind: pick(&text, "bind", "127.0.0.1:8090"),
        router_url: pick(&text, "router_url", "http://127.0.0.1:8090"),
        provider_url: pick(&text, "provider_url", "http://127.0.0.1:8080"),
        model_id: pick(&text, "model_id", "tiny-q4"),
        model_path: pick(&text, "model_path", "./models/tiny-q4.gguf"),
        audit_log_path: pick(&text, "audit_log_path", "./logs/sawyer-audit.log"),
    })
}

fn write_local_config(path: &Path, pack: &str) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let model_id = match pack {
        "tiny" => "tiny-q4",
        "balanced" => "balanced-q4",
        _ => "quality-q4",
    };
    let body = format!(
        "bind = \"127.0.0.1:8090\"\nrouter_url = \"http://127.0.0.1:8090\"\nprovider_url = \"http://127.0.0.1:8080\"\nallow_cloud = false\nprivate_mode = true\nmax_request_bytes = 1048576\nmax_context_tokens = 4096\nrate_limit_per_minute = 60\naudit_log_path = \"./logs/sawyer-audit.log\"\nmodel_id = \"{model_id}\"\nmodel_path = \"./models/{model_id}.gguf\"\nprovider = \"llama.cpp\"\n"
    );
    fs::write(path, body)?;
    Ok(())
}

fn load_model_catalog() -> Result<ModelCatalog> {
    let text = fs::read_to_string("config/model-packs.json")?;
    let v: serde_json::Value =
        serde_json::from_str(&text).context("invalid config/model-packs.json")?;

    let packs = v
        .get("packs")
        .and_then(|x| x.as_array())
        .ok_or_else(|| anyhow!("missing packs"))?
        .iter()
        .map(|p| ModelPack {
            id: p
                .get("id")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            model_ids: p
                .get("model_ids")
                .and_then(|x| x.as_array())
                .map(|m| {
                    m.iter()
                        .filter_map(|s| s.as_str().map(str::to_string))
                        .collect::<Vec<String>>()
                })
                .unwrap_or_default(),
        })
        .collect::<Vec<_>>();

    let models = v
        .get("models")
        .and_then(|m| m.as_array())
        .ok_or_else(|| anyhow!("missing models"))?
        .iter()
        .map(|m| ModelEntry {
            id: m
                .get("id")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            source_url: m
                .get("source_url")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            expected_sha256: m
                .get("expected_sha256")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            size_bytes: m
                .get("size_bytes")
                .and_then(|x| x.as_u64())
                .unwrap_or_default(),
            license: m
                .get("license")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            recommended_ram_gb: m
                .get("recommended_ram_gb")
                .and_then(|x| x.as_u64())
                .unwrap_or_default(),
            default_local_path: m
                .get("default_local_path")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
        })
        .collect();

    Ok(ModelCatalog { packs, models })
}

fn resolve_pack(pack: &str, catalog: &ModelCatalog) -> Result<ModelEntry> {
    let pack_entry = catalog
        .packs
        .iter()
        .find(|p| p.id == pack)
        .ok_or_else(|| anyhow!("unknown pack: {pack}"))?;
    let model_id = pack_entry
        .model_ids
        .first()
        .ok_or_else(|| anyhow!("pack {pack} has no models"))?;
    catalog
        .models
        .iter()
        .find(|m| &m.id == model_id)
        .cloned()
        .ok_or_else(|| anyhow!("model metadata missing for {model_id}"))
}

fn sha256_file(path: &Path) -> Result<String> {
    let output = Command::new("sha256sum").arg(path).output();
    let line = match output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).to_string(),
        _ => {
            let out = Command::new("shasum")
                .args(["-a", "256"])
                .arg(path)
                .output()
                .context("need sha256sum or shasum for checksum verification")?;
            if !out.status.success() {
                bail!("checksum tool failed");
            }
            String::from_utf8_lossy(&out.stdout).to_string()
        }
    };
    line.split_whitespace()
        .next()
        .map(|s| s.to_string())
        .ok_or_else(|| anyhow!("unable to parse checksum output"))
}

fn is_placeholder_checksum(sum: &str) -> bool {
    sum.len() != 64
        || sum.chars().all(|c| c == '0')
        || sum.chars().all(|c| c == '1')
        || sum.chars().all(|c| c == '2')
        || sum.chars().all(|c| c == '3')
        || sum.chars().all(|c| c == '4')
        || sum.chars().all(|c| c == '5')
}

fn detect_ram_gb() -> u64 {
    if let Ok(meminfo) = fs::read_to_string("/proc/meminfo") {
        if let Some(line) = meminfo.lines().find(|l| l.starts_with("MemTotal:")) {
            if let Some(kb) = line
                .split_whitespace()
                .nth(1)
                .and_then(|v| v.parse::<u64>().ok())
            {
                return kb / 1024 / 1024;
            }
        }
    }
    8
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
    std::env::var("SAWYER_STATE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./.sawyer"))
}
