#!/usr/bin/env bash
set -euo pipefail
ARCH="$(uname -m)"; OS="$(uname -s)"
[[ "$OS" == "Linux" ]] || { echo "ERROR: use linux installer on Linux"; exit 1; }
command -v cargo >/dev/null 2>&1 || { echo "Installing Rust toolchain..."; curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o /tmp/rustup-init.sh; sh /tmp/rustup-init.sh -y; source "$HOME/.cargo/env"; }
if command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y build-essential pkg-config curl ca-certificates; fi
if command -v dnf >/dev/null 2>&1; then sudo dnf install -y gcc gcc-c++ make pkgconfig curl ca-certificates; fi
cargo build --release --bin sawyer
mkdir -p .sawyer logs
cp -n config/examples/local-balanced.toml .sawyer/config.toml || true
echo "Installed SawyerCore for $OS/$ARCH"
echo "Next: ./target/release/sawyer first-run --config ./.sawyer/config.toml"
