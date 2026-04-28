#!/usr/bin/env bash
set -euo pipefail
MODEL_PATH="${1:-${SAWYER_LLAMACPP_MODEL_PATH:-}}"
[[ -n "$MODEL_PATH" ]] || { echo "ERROR: pass model path. usage: $0 /abs/path/model.gguf"; exit 1; }
[[ -f "$MODEL_PATH" ]] || { echo "ERROR: model file not found: $MODEL_PATH"; exit 1; }
command -v llama-server >/dev/null 2>&1 || { echo "ERROR: llama-server not found; run ./scripts/install-llamacpp.sh"; exit 1; }
HOST="127.0.0.1"; PORT="8080"
mkdir -p .local-stack/logs .local-stack
llama-server --host "$HOST" --port "$PORT" --model "$MODEL_PATH" > .local-stack/logs/llamacpp.log 2>&1 &
PID=$!; echo "$PID" > .local-stack/llamacpp.pid
for i in $(seq 1 45); do
  if curl -fsS "http://$HOST:$PORT/health" >/dev/null 2>&1; then
    echo "llama.cpp ready at http://$HOST:$PORT"
    exit 0
  fi
  kill -0 "$PID" >/dev/null 2>&1 || { echo "ERROR: llama-server exited. check .local-stack/logs/llamacpp.log"; exit 1; }
  sleep 1
done
kill "$PID" || true
echo "ERROR: health check failed on http://$HOST:$PORT/health"
exit 1
