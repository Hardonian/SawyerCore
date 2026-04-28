use std::env;
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{anyhow, bail, Context, Result};
use clap::{Args, Parser, Subcommand, ValueEnum};
use sawyer_core::{DeterministicRuntime, RuntimeConfig};
use sawyer_server::{serve, ServerState};
use serde::{Deserialize, Serialize};

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
    Models(ModelsArgs),
    VerifyBinary(VerifyBinaryArgs),
    Config(ConfigArgs),
    Audit(AuditArgs),
    Deploy(DeployArgs),
    Mode(ModeArgs),
    Security(SecurityArgs),
    Limits(LimitsArgs),
    Snapshot(SnapshotArgs),
    Restore(RestoreArgs),
}

#[derive(Args)]
struct ServeArgs {
    #[arg(long, default_value = "127.0.0.1:8080")]
    bind: String,
    #[arg(long, default_value_t = false)]
    airgapped: bool,
    #[arg(long, default_value_t = false)]
    require_signed_config: bool,
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

#[derive(Args)]
struct VerifyBinaryArgs {
    file: PathBuf,
    #[arg(long)]
    manifest: Option<PathBuf>,
}

#[derive(Args)]
struct ConfigArgs {
    #[command(subcommand)]
    command: ConfigCommands,
}

#[derive(Subcommand)]
enum ConfigCommands {
    Sign(ConfigSignArgs),
    Verify(ConfigVerifyArgs),
    Migrate(ConfigMigrateArgs),
}

#[derive(Args)]
struct ConfigSignArgs {
    #[arg(long, default_value = ".sawyer/config.json")]
    file: PathBuf,
    #[arg(long, default_value = "SAWYER_CONFIG_SIGNING_KEY")]
    key_env: String,
}

#[derive(Args)]
struct ConfigVerifyArgs {
    #[arg(long, default_value = ".sawyer/config.json")]
    file: PathBuf,
    #[arg(long, default_value = "SAWYER_CONFIG_SIGNING_KEY")]
    key_env: String,
    #[arg(long, default_value_t = false)]
    require_signed: bool,
}

#[derive(Args)]
struct ConfigMigrateArgs {
    #[arg(long, default_value = ".sawyer/config.json")]
    file: PathBuf,
    #[arg(long)]
    target_version: Option<u32>,
}

#[derive(Args)]
struct AuditArgs {
    #[command(subcommand)]
    command: AuditCommands,
}

#[derive(Subcommand)]
enum AuditCommands {
    Verify,
    Export(AuditExportArgs),
}

#[derive(Args)]
struct AuditExportArgs {
    out: PathBuf,
}

#[derive(Args)]
struct DeployArgs {
    #[command(subcommand)]
    command: DeployCommands,
}

#[derive(Subcommand)]
enum DeployCommands {
    Explain,
    Validate,
}

#[derive(Args)]
struct ModeArgs {
    #[command(subcommand)]
    command: ModeCommands,
}

#[derive(Subcommand)]
enum ModeCommands {
    Set { mode: DeploymentMode },
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
struct LimitsArgs {
    #[command(subcommand)]
    command: LimitsCommands,
}

#[derive(Subcommand)]
enum LimitsCommands {
    Show,
    Set(LimitsSetArgs),
}

#[derive(Args)]
struct LimitsSetArgs {
    #[arg(long)]
    max_concurrent_tasks: u32,
    #[arg(long)]
    max_memory_mb_per_task: u32,
    #[arg(long)]
    max_tokens_per_request: u32,
    #[arg(long)]
    max_cpu_ms_per_task: u32,
}

#[derive(Args)]
struct SnapshotArgs {
    #[arg(long, default_value = "./snapshot.json")]
    out: PathBuf,
}

#[derive(Args)]
struct RestoreArgs {
    file: PathBuf,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, ValueEnum, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum DeploymentMode {
    SingleNode,
    LocalCluster,
    Airgapped,
    ServerMode,
    PortableMode,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RuntimeLimits {
    max_concurrent_tasks: u32,
    max_memory_mb_per_task: u32,
    max_tokens_per_request: u32,
    max_cpu_ms_per_task: u32,
}

impl Default for RuntimeLimits {
    fn default() -> Self {
        Self {
            max_concurrent_tasks: 32,
            max_memory_mb_per_task: 2048,
            max_tokens_per_request: 8192,
            max_cpu_ms_per_task: 30_000,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RuntimeConfigFile {
    version: u32,
    mode: DeploymentMode,
    allow_cloud: bool,
    enforce_signed_config: bool,
    allow_network: bool,
    provider_local_only: bool,
}

impl Default for RuntimeConfigFile {
    fn default() -> Self {
        Self {
            version: 1,
            mode: DeploymentMode::SingleNode,
            allow_cloud: false,
            enforce_signed_config: false,
            allow_network: true,
            provider_local_only: true,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct ReleaseManifest {
    binary_path: String,
    binary_sha256: String,
    version: String,
    commit_hash: String,
    build_timestamp_unix: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct AuditRecord {
    ts_unix: u64,
    event: String,
    prev_hash: String,
    hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SnapshotFile {
    config: RuntimeConfigFile,
    limits: RuntimeLimits,
    audit_records: Vec<AuditRecord>,
    cluster_registry: serde_json::Value,
    adaptive_state: serde_json::Value,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    let cli = Cli::parse();

    match cli.command {
        Commands::Doctor => doctor(),
        Commands::Serve(args) => serve_cmd(args).await,
        Commands::Models(args) => match args.command {
            ModelsCommands::List => models_list(),
        },
        Commands::VerifyBinary(args) => verify_binary(args),
        Commands::Config(args) => config_cmd(args),
        Commands::Audit(args) => audit_cmd(args),
        Commands::Deploy(args) => deploy_cmd(args),
        Commands::Mode(args) => mode_cmd(args),
        Commands::Security(args) => security_cmd(args),
        Commands::Limits(args) => limits_cmd(args),
        Commands::Snapshot(args) => snapshot_cmd(args),
        Commands::Restore(args) => restore_cmd(args),
    }
}

fn doctor() -> Result<()> {
    let mut runtime = DeterministicRuntime::new(RuntimeConfig::default());
    runtime.step();
    let cfg = load_runtime_config()?;
    let limits = load_limits()?;

    println!("Sawyer doctor report");
    println!("- tick: {}", runtime.tick());
    println!("- mode: {:?}", cfg.mode);
    println!("- allow_cloud: {}", cfg.allow_cloud);
    println!("- allow_network: {}", cfg.allow_network);
    println!("- enforce_signed_config: {}", cfg.enforce_signed_config);
    println!("- max_concurrent_tasks: {}", limits.max_concurrent_tasks);
    Ok(())
}

async fn serve_cmd(args: ServeArgs) -> Result<()> {
    let cfg = load_runtime_config()?;
    if args.require_signed_config || cfg.enforce_signed_config {
        let verify = verify_config_internal(&ConfigVerifyArgs {
            file: config_path(),
            key_env: "SAWYER_CONFIG_SIGNING_KEY".to_string(),
            require_signed: true,
        })?;
        if !verify {
            bail!("config signature verification failed in strict mode");
        }
    } else if signature_path(&config_path()).exists() {
        let _ = verify_config_internal(&ConfigVerifyArgs {
            file: config_path(),
            key_env: "SAWYER_CONFIG_SIGNING_KEY".to_string(),
            require_signed: false,
        })?;
    } else {
        eprintln!("warning: config is unsigned (allowed outside strict mode)");
    }

    let addr: SocketAddr = args.bind.parse().context("invalid --bind address")?;
    if args.airgapped || cfg.mode == DeploymentMode::Airgapped {
        enforce_airgapped(addr, &cfg)?;
    }

    println!("starting server on {}", args.bind);
    serve(&args.bind, ServerState::default()).await
}

fn verify_binary(args: VerifyBinaryArgs) -> Result<()> {
    let digest = file_sha256(&args.file)?;
    let manifest_path = args
        .manifest
        .unwrap_or_else(|| args.file.with_extension("manifest.json"));

    let manifest: ReleaseManifest = serde_json::from_slice(
        &fs::read(&manifest_path)
            .with_context(|| format!("manifest not found: {}", manifest_path.display()))?,
    )?;

    if manifest.binary_sha256 != digest {
        bail!(
            "binary hash mismatch: expected {}, got {}",
            manifest.binary_sha256,
            digest
        );
    }

    println!("verified binary integrity");
    println!("- file: {}", args.file.display());
    println!("- sha256: {}", digest);
    println!("- version: {}", manifest.version);
    println!("- commit: {}", manifest.commit_hash);
    Ok(())
}

fn config_cmd(args: ConfigArgs) -> Result<()> {
    match args.command {
        ConfigCommands::Sign(sign_args) => config_sign(sign_args),
        ConfigCommands::Verify(verify_args) => {
            let valid = verify_config_internal(&verify_args)?;
            if !valid {
                bail!("config verification failed");
            }
            Ok(())
        }
        ConfigCommands::Migrate(migrate_args) => config_migrate(migrate_args),
    }
}

fn config_sign(args: ConfigSignArgs) -> Result<()> {
    let key = env::var(&args.key_env)
        .with_context(|| format!("missing key env var: {}", args.key_env))?;
    let bytes = fs::read(&args.file)?;
    let signature = sign_bytes(&bytes, &key)?;
    let sig_path = signature_path(&args.file);
    fs::write(&sig_path, signature)?;
    println!("config signed: {}", sig_path.display());
    Ok(())
}

fn verify_config_internal(args: &ConfigVerifyArgs) -> Result<bool> {
    let sig_path = signature_path(&args.file);
    if !sig_path.exists() {
        if args.require_signed {
            bail!("missing config signature: {}", sig_path.display());
        }
        eprintln!("warning: config unsigned");
        return Ok(false);
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

fn audit_export(args: AuditExportArgs) -> Result<()> {
    let records = read_audit_records()?;
    write_json(&args.out, &records)?;
    println!(
        "exported {} audit records to {}",
        records.len(),
        args.out.display()
    );
    Ok(())
}

fn deploy_cmd(args: DeployArgs) -> Result<()> {
    match args.command {
        DeployCommands::Explain => {
            for mode in [
                DeploymentMode::SingleNode,
                DeploymentMode::LocalCluster,
                DeploymentMode::Airgapped,
                DeploymentMode::ServerMode,
                DeploymentMode::PortableMode,
            ] {
                println!("{}", describe_mode(mode));
            }
            Ok(())
        }
        DeployCommands::Validate => {
            let cfg = load_runtime_config()?;
            validate_mode(cfg.mode, &cfg)?;
            println!("deployment config valid for mode: {:?}", cfg.mode);
            Ok(())
        }
    }
}

fn mode_cmd(args: ModeArgs) -> Result<()> {
    let mut cfg = load_runtime_config()?;
    match args.command {
        ModeCommands::Set { mode } => {
            cfg.mode = mode;
            if mode == DeploymentMode::Airgapped {
                cfg.allow_network = false;
                cfg.allow_cloud = false;
                cfg.provider_local_only = true;
            }
            write_json(&config_path(), &cfg)?;
            println!("mode set to {:?}", mode);
            Ok(())
        }
        ModeCommands::Current => {
            println!("{:?}", cfg.mode);
            Ok(())
        }
    }
}

fn security_cmd(args: SecurityArgs) -> Result<()> {
    match args.command {
        SecurityCommands::Audit => {
            println!("security audit report");
            println!("- dependency allowlist: docs/security/dependency-policy.md");

            let cargo_audit = Command::new("cargo").arg("audit").output();
            match cargo_audit {
                Ok(out) => {
                    print!("{}", String::from_utf8_lossy(&out.stdout));
                    eprint!("{}", String::from_utf8_lossy(&out.stderr));
                    if !out.status.success() {
                        let stderr = String::from_utf8_lossy(&out.stderr);
                        if stderr.contains("no such command: `audit`") {
                            println!("- cargo-audit command not installed; skipping CVE scan");
                        } else {
                            bail!("cargo audit reported vulnerabilities or an execution error");
                        }
                    }
                }
                Err(_) => {
                    println!("- cargo-audit unavailable; install cargo-audit for CVE scanning");
                }
            }

            let tree = Command::new("cargo")
                .args(["tree", "--workspace"])
                .status()?;
            if !tree.success() {
                bail!("cargo tree failed");
            }
            println!(
                "- license and unused dependency checks require cargo-deny/cargo-udeps tooling"
            );
            Ok(())
        }
    }
}

fn limits_cmd(args: LimitsArgs) -> Result<()> {
    match args.command {
        LimitsCommands::Show => {
            let limits = load_limits()?;
            println!("{}", serde_json::to_string_pretty(&limits)?);
            Ok(())
        }
        LimitsCommands::Set(set) => {
            let limits = RuntimeLimits {
                max_concurrent_tasks: set.max_concurrent_tasks,
                max_memory_mb_per_task: set.max_memory_mb_per_task,
                max_tokens_per_request: set.max_tokens_per_request,
                max_cpu_ms_per_task: set.max_cpu_ms_per_task,
            };
            write_json(&limits_path(), &limits)?;
            println!("runtime limits updated");
            Ok(())
        }
    }
}

fn snapshot_cmd(args: SnapshotArgs) -> Result<()> {
    let snapshot = SnapshotFile {
        config: load_runtime_config()?,
        limits: load_limits()?,
        audit_records: read_audit_records()?,
        adaptive_state: serde_json::json!({"status": "not-captured-in-v1"}),
        cluster_registry: serde_json::json!({"nodes": []}),
    };
    write_json(&args.out, &snapshot)?;
    println!("snapshot written: {}", args.out.display());
    Ok(())
}

fn restore_cmd(args: RestoreArgs) -> Result<()> {
    let snapshot: SnapshotFile = serde_json::from_slice(&fs::read(&args.file)?)?;
    validate_mode(snapshot.config.mode, &snapshot.config)?;

    write_json(&config_path(), &snapshot.config)?;
    write_json(&limits_path(), &snapshot.limits)?;
    write_audit_records(&snapshot.audit_records)?;

    println!("snapshot restored from {}", args.file.display());
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

fn state_dir() -> PathBuf {
    PathBuf::from(env::var("SAWYER_STATE_DIR").unwrap_or_else(|_| ".sawyer".to_string()))
}

fn config_path() -> PathBuf {
    state_dir().join("config.json")
}

fn limits_path() -> PathBuf {
    state_dir().join("limits.json")
}

fn audit_path() -> PathBuf {
    state_dir().join("audit").join("log.jsonl")
}

fn signature_path(config: &Path) -> PathBuf {
    let mut path = config.to_path_buf();
    path.set_extension("json.sig");
    path
}

fn load_runtime_config() -> Result<RuntimeConfigFile> {
    let path = config_path();
    if !path.exists() {
        let cfg = RuntimeConfigFile::default();
        write_json(&path, &cfg)?;
        return Ok(cfg);
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn load_limits() -> Result<RuntimeLimits> {
    let path = limits_path();
    if !path.exists() {
        let limits = RuntimeLimits::default();
        write_json(&path, &limits)?;
        return Ok(limits);
    }
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut f = File::create(path)?;
    let body = serde_json::to_vec_pretty(value)?;
    f.write_all(&body)?;
    f.write_all(b"\n")?;
    Ok(())
}

fn file_sha256(path: &Path) -> Result<String> {
    let output = Command::new("sha256sum")
        .arg(path)
        .output()
        .context("sha256sum missing")?;
    if !output.status.success() {
        bail!("sha256sum failed for {}", path.display());
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let hash = stdout
        .split_whitespace()
        .next()
        .context("unable to parse sha256sum output")?;
    Ok(hash.to_string())
}

fn sha256_bytes(input: &[u8]) -> Result<String> {
    let mut child = Command::new("sha256sum")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .context("sha256sum missing")?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input)?;
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
        bail!("sha256sum failed");
    }
    let hash = String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .next()
        .context("unable to parse sha256sum output")?
        .to_string();
    Ok(hash)
}

fn sign_bytes(payload: &[u8], key: &str) -> Result<String> {
    let mut data = Vec::with_capacity(payload.len() + key.len());
    data.extend_from_slice(payload);
    data.extend_from_slice(key.as_bytes());
    sha256_bytes(&data)
}

fn read_audit_records() -> Result<Vec<AuditRecord>> {
    let path = audit_path();
    if !path.exists() {
        return Ok(vec![]);
    }

    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut out = Vec::new();
    for line in reader.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        out.push(serde_json::from_str::<AuditRecord>(&line)?);
    }
    Ok(out)
}

fn write_audit_records(records: &[AuditRecord]) -> Result<()> {
    let path = audit_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut f = File::create(path)?;
    for r in records {
        let line = serde_json::to_string(r)?;
        f.write_all(line.as_bytes())?;
        f.write_all(b"\n")?;
    }
    Ok(())
}

fn audit_hash(ts_unix: u64, event: &str, prev_hash: &str) -> String {
    let payload = format!("{ts_unix}:{event}:{prev_hash}");
    sha256_bytes(payload.as_bytes()).unwrap_or_else(|_| "HASH_ERROR".to_string())
}

fn enforce_airgapped(bind: SocketAddr, cfg: &RuntimeConfigFile) -> Result<()> {
    let localhost = IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1));
    if bind.ip() != localhost {
        bail!("airgapped mode requires localhost bind address");
    }
    if cfg.allow_network {
        bail!("airgapped mode requires allow_network=false");
    }
    if cfg.allow_cloud {
        bail!("airgapped mode requires allow_cloud=false");
    }
    if !cfg.provider_local_only {
        bail!("airgapped mode requires provider_local_only=true");
    }
    Ok(())
}

fn validate_mode(mode: DeploymentMode, cfg: &RuntimeConfigFile) -> Result<()> {
    match mode {
        DeploymentMode::SingleNode => Ok(()),
        DeploymentMode::LocalCluster => Ok(()),
        DeploymentMode::Airgapped => {
            enforce_airgapped(SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 0), cfg)
        }
        DeploymentMode::ServerMode => {
            if cfg.enforce_signed_config {
                Ok(())
            } else {
                bail!("server-mode requires enforce_signed_config=true")
            }
        }
        DeploymentMode::PortableMode => Ok(()),
    }
}

fn describe_mode(mode: DeploymentMode) -> String {
    match mode {
        DeploymentMode::SingleNode => "single-node: bind localhost, info logging, local providers preferred, moderate security".to_string(),
        DeploymentMode::LocalCluster => "local-cluster: bind RFC1918/internal, warn logging, local gateway providers, strict policy".to_string(),
        DeploymentMode::Airgapped => "airgapped: localhost-only, no network or DNS, local provider only, strictest security".to_string(),
        DeploymentMode::ServerMode => "server-mode: operator bind, JSON logs, signed config required, explicit cloud opt-in only".to_string(),
        DeploymentMode::PortableMode => "portable-mode: localhost-first, reduced logging noise, local provider required by default".to_string(),
    }
}

#[allow(dead_code)]
fn now_unix() -> Result<u64> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| anyhow!("system time error: {e}"))?
        .as_secs())
}
