#!/usr/bin/env bash
set -euo pipefail
if command -v llama-server >/dev/null 2>&1; then
  echo "llama-server already installed: $(command -v llama-server)"
  exit 0
fi
if command -v brew >/dev/null 2>&1; then brew install llama.cpp && exit 0; fi
if command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y git cmake build-essential; fi
TMP_DIR="${TMPDIR:-/tmp}/llama.cpp.$$"
git clone --depth 1 https://github.com/ggml-org/llama.cpp "$TMP_DIR"
cmake -S "$TMP_DIR" -B "$TMP_DIR/build" -DLLAMA_BUILD_SERVER=ON
cmake --build "$TMP_DIR/build" -j
install -m 0755 "$TMP_DIR/build/bin/llama-server" "$HOME/.local/bin/llama-server"
echo "Installed llama-server to $HOME/.local/bin/llama-server"
