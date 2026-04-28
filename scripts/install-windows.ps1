$ErrorActionPreference = 'Stop'
if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
  Write-Host "WSL detected. For GPU vLLM prefer WSL/Linux path."
}
if (-not (Get-Command cargo.exe -ErrorAction SilentlyContinue)) {
  Write-Error "Rust is required. Install from https://rustup.rs then rerun."
}
cargo build --release --bin sawyer
New-Item -ItemType Directory -Force .sawyer | Out-Null
New-Item -ItemType Directory -Force logs | Out-Null
if (-not (Test-Path .sawyer/config.toml)) { Copy-Item config/examples/local-balanced.toml .sawyer/config.toml }
Set-Alias sawyer-local "$PWD/target/release/sawyer.exe"
Write-Host "Next: ./target/release/sawyer.exe first-run --config ./.sawyer/config.toml"
