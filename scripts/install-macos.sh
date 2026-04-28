#!/usr/bin/env bash
set -euo pipefail
[[ "$(uname -s)" == "Darwin" ]] || { echo "ERROR: use macOS installer on macOS"; exit 1; }
command -v brew >/dev/null 2>&1 || { echo "ERROR: Homebrew required (https://brew.sh)"; exit 1; }
brew install rust pkg-config curl
cargo build --release --bin sawyer
mkdir -p .sawyer logs
cp -n config/examples/local-balanced.toml .sawyer/config.toml || true
echo "Next: ./target/release/sawyer first-run --config ./.sawyer/config.toml"
