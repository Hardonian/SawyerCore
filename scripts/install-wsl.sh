#!/usr/bin/env bash
set -euo pipefail
grep -qi microsoft /proc/version || { echo "ERROR: this installer is for WSL only"; exit 1; }
./scripts/install-linux.sh
if command -v nvidia-smi >/dev/null 2>&1; then
  echo "NVIDIA GPU detected inside WSL; vLLM can be considered if CUDA is configured."
else
  echo "No NVIDIA GPU path detected; recommending llama.cpp CPU provider."
fi
echo "Next: ./target/release/sawyer first-run --config ./.sawyer/config.toml"
