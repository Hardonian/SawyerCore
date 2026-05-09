use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::TcpStream,
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

use anyhow::{anyhow, bail, Context, Result};
use clap::{Args, Parser, Subcommand};
use sawyer_core::{DeterministicRuntime, RuntimeConfig};
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
    Recommend,
    Download {
        model_id: String,
        #[arg(long)]
        yes: bool,
    },
    Verify {
        model_id: String,
    },
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
    models: Vec<ModelEntry>,
}

#[derive(Debug)]
struct ModelEntry {
    id: String,
    source_url: String,
    expected_sha256: String,
    size_bytes: u64,
    license: String,
    recommended_ram_gb: u64,
    recommended_provider: String,
    context_limit: usize,
    task_suitability: Vec<String>,
    default_local_path: String,
}

struct LocalConfig {
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
        Commands::Sim(sim) => match sim.command {
            SimCommands::Run => sim_run(),
        },
        Commands::Models(args) => models(args),
        Commands::FirstRun(args) => first_run(args),
        Commands::Smoke(args) => match args.command {
            SmokeCommands::Local { config } => smoke_local(&config),
        },
    }

    let key = env::var(&args.key_env)
        .with_context(|| format!("missing key env var: {}", args.key_env))?;
    let bytes = fs::read(&args.file)?;
    let expected = sign_bytes(&bytes, &key)?;
    let actual = fs::read_to_string(&sig_path)?;
    let valid = expected.trim() == actual.trim();
    println!("config verify: valid={valid}");
    Ok(valid)
}

fn config_migrate(args: ConfigMigrateArgs) -> Result<()> {
    let mut cfg = load_runtime_config()?;
    let target = args.target_version.unwrap_or(1);

    if cfg.version > target {
        bail!("downgrade migration is not supported");
    }
    cfg.version = target;

    write_json(&args.file, &cfg)?;
    println!("config migrated to version {}", cfg.version);
    Ok(())
}

fn audit_cmd(args: AuditArgs) -> Result<()> {
    match args.command {
        AuditCommands::Verify => audit_verify(),
        AuditCommands::Export(export_args) => audit_export(export_args),
    }
}

fn audit_verify() -> Result<()> {
    let records = read_audit_records()?;
    let mut prev = "GENESIS".to_string();
    for (idx, record) in records.iter().enumerate() {
        if record.prev_hash != prev {
            bail!("audit chain broken at index {idx}: prev_hash mismatch");
        }
        let expected = audit_hash(record.ts_unix, &record.event, &record.prev_hash);
        if record.hash != expected {
            bail!("audit chain broken at index {idx}: hash mismatch");
        }
        prev = record.hash.clone();
    }
    println!("audit chain valid: {} entries", records.len());
    Ok(())
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
    let state = ServerState::with_security(
        security,
        args.node_token,
        std::env::var("SAWYER_CLOUD_API_KEY").is_ok(),
    );
    println!("starting server on {}", args.bind);
    serve(&args.bind, state, args.unsafe_dev).await
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
        ModelsCommands::Download { model_id, yes } => models_download(&model_id, yes),
        ModelsCommands::Verify { model_id } => models_verify(&model_id),
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
    } else if ram <= 32 {
        "quality-local"
    } else {
        "workstation"
    };
    println!("Recommended model pack: {pack} (detected RAM: {} GB)", ram);
    println!("Next: sawyer models list-local || sawyer models download <model-id> --yes");
    Ok(())
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

fn smoke_local(config_path: &Path) -> Result<()> {
    let cfg = parse_local_config(config_path)?;
    if !Path::new(config_path).exists() {
        bail!("config missing: {}", config_path.display());
    }
    if let Some(parent) = Path::new(&cfg.audit_log_path).parent() {
        fs::create_dir_all(parent)?;
    }
    OpenOptions::new()
        .create(true)
        .append(true)
        .open(&cfg.audit_log_path)
        .with_context(|| format!("audit log not writable: {}", cfg.audit_log_path))?;

    let provider_addr = parse_host_port(&cfg.provider_url)?;
    if !http_health(&provider_addr.0, provider_addr.1, "/health") {
        println!("provider unavailable (truthful degraded state)");
    }

    if !Path::new(&cfg.model_path).exists() {
        println!("MODEL_MISSING: {}", cfg.model_path);
        println!("Next: sawyer models download {} --yes", cfg.model_id);
        return Ok(());
    }
    models_verify(&cfg.model_id)?;

    let router_addr = parse_host_port(&cfg.router_url)?;
    let ok = chat_call(&router_addr.0, router_addr.1, &cfg.model_id)?;
    if !ok {
        bail!("router chat completion failed");
    }

    let private_blocked = cloud_blocked(&router_addr.0, router_addr.1)?;
    if !private_blocked {
        bail!("private prompt cloud protection check failed");
    }

    let degraded = degraded_when_unavailable(&router_addr.0, router_addr.1)?;
    if !degraded {
        bail!("degraded response check failed");
    }
    println!("smoke local passed");
    Ok(())
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

fn http_post(host: &str, port: u16, path: &str, json: &str) -> Result<String> {
    let mut stream = TcpStream::connect((host, port))
        .with_context(|| format!("failed to connect to http://{host}:{port}"))?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let req = format!(
        "POST {path} HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        json.len(), json
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
        router_url: pick(&text, "router_url", "http://127.0.0.1:8090"),
        provider_url: pick(&text, "provider_url", "http://127.0.0.1:8080"),
        model_id: pick(&text, "model_id", "tiny-q4"),
        model_path: pick(&text, "model_path", "./models/tiny-q4.gguf"),
        audit_log_path: pick(&text, "audit_log_path", "./logs/sawyer-audit.log"),
    })
}

fn write_local_config(path: &Path, mode: &str) -> Result<()> {
    if path.exists() {
        let backup = path.with_extension("toml.bak");
        fs::copy(path, &backup).with_context(|| format!("failed backing up {}", path.display()))?;
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let model_id = if mode == "local-tiny" {
        "tiny-q4"
    } else {
        "balanced-q4"
    };
    let body = format!(
        "# Sawyer local configuration\nrouter_url = \"http://127.0.0.1:8090\"\nprovider_url = \"http://127.0.0.1:8080\"\nmodel_id = \"{model_id}\"\nmodel_path = \"./models/{model_id}.gguf\"\naudit_log_path = \"./logs/sawyer-audit.log\"\nallow_cloud = false\nprivate_mode = true\n"
    );
    fs::write(path, body)?;
    Ok(())
}

fn load_model_catalog() -> Result<ModelCatalog> {
    let text = fs::read_to_string("config/model-packs.json")?;
    let v: serde_json::Value =
        serde_json::from_str(&text).context("invalid config/model-packs.json")?;
    let models = v
        .get("models")
        .and_then(|m| m.as_array())
        .ok_or_else(|| anyhow!("missing models array"))?;
    let mut out = Vec::new();
    for m in models {
        out.push(ModelEntry {
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
            recommended_provider: m
                .get("recommended_provider")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
            context_limit: m
                .get("context_limit")
                .and_then(|x| x.as_u64())
                .unwrap_or_default() as usize,
            task_suitability: m
                .get("task_suitability")
                .and_then(|x| x.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|i| i.as_str().map(str::to_string))
                        .collect()
                })
                .unwrap_or_default(),
            default_local_path: m
                .get("default_local_path")
                .and_then(|x| x.as_str())
                .unwrap_or_default()
                .to_string(),
        });
    }
    Ok(ModelCatalog { models: out })
}

fn find_model<'a>(catalog: &'a ModelCatalog, model_id: &str) -> Result<&'a ModelEntry> {
    catalog
        .models
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| anyhow!("unknown model id: {model_id}"))
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

fn state_dir() -> PathBuf {
    std::env::var("SAWYER_STATE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./.sawyer"))
}
