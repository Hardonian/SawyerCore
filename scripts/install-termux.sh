#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
command -v pkg >/dev/null 2>&1 || { echo "ERROR: run inside Termux"; exit 1; }
pkg update -y
pkg install -y clang make cmake git rust curl
TOTAL_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
RAM_GB=$((TOTAL_KB/1024/1024))
if [[ "$RAM_GB" -gt 8 ]]; then echo "Termux detected; still recommending tiny pack for thermals/stability."; fi
cargo build --release --bin sawyer
mkdir -p .sawyer logs
cp -n config/examples/termux-tiny.toml .sawyer/config.toml || true
echo "WARNING: building llama.cpp on some phones is heavy; use remote Linux node if needed."
echo "Next: ./target/release/sawyer first-run --config ./.sawyer/config.toml"
