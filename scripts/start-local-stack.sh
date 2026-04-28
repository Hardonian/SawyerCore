#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="${ROOT_DIR}/.local-stack"
LOG_DIR="${ROOT_DIR}/.local-stack/logs"
mkdir -p "${PID_DIR}" "${LOG_DIR}"

SAWYER_BIND_HOST="${SAWYER_BIND_HOST:-127.0.0.1}"
SAWYER_PORT="${SAWYER_PORT:-8787}"
SAWYER_START_TIMEOUT_SECONDS="${SAWYER_START_TIMEOUT_SECONDS:-30}"
SAWYER_PID_FILE="${PID_DIR}/sawyer.pid"
SAWYER_LOG_FILE="${LOG_DIR}/sawyer.log"
RESOLVED_CONFIG="${ROOT_DIR}/config/providers/local-stack.resolved.json"

check_http() {
  local url="$1"
  curl -fsS "${url}" >/dev/null 2>&1
}

VLLM_REACHABLE=false
LITELLM_REACHABLE=false
LLAMACPP_REACHABLE=false

if check_http "http://127.0.0.1:8000/v1/models"; then
  VLLM_REACHABLE=true
else
  "${ROOT_DIR}/scripts/start-vllm.sh"
  VLLM_REACHABLE=true
fi

if check_http "http://127.0.0.1:4000/v1/models"; then
  LITELLM_REACHABLE=true
else
  "${ROOT_DIR}/scripts/start-litellm.sh"
  LITELLM_REACHABLE=true
fi

if [[ -n "${SAWYER_LLAMACPP_MODEL_PATH:-}" ]] || [[ -n "${LLAMACPP_MODEL_PATH:-}" ]]; then
  if check_http "http://127.0.0.1:8080/health"; then
    LLAMACPP_REACHABLE=true
  else
    "${ROOT_DIR}/scripts/start-llamacpp.sh"
    LLAMACPP_REACHABLE=true
  fi
fi

cat >"${RESOLVED_CONFIG}" <<JSON
{
  "profile": "local-safe",
  "private_mode": true,
  "cloud": {
    "enabled": false,
    "fallback": false
  },
  "providers": {
    "vllm": { "enabled": ${VLLM_REACHABLE}, "base_url": "http://127.0.0.1:8000/v1", "model": "Qwen/Qwen2.5-3B-Instruct" },
    "litellm": { "enabled": ${LITELLM_REACHABLE}, "base_url": "http://127.0.0.1:4000/v1", "model": "local-qwen" },
    "llamacpp": { "enabled": ${LLAMACPP_REACHABLE}, "base_url": "http://127.0.0.1:8080/v1", "model_path_present": $([[ -n "${SAWYER_LLAMACPP_MODEL_PATH:-${LLAMACPP_MODEL_PATH:-}}" ]] && echo true || echo false) },
    "mobile_npu": { "enabled": false, "status": "unavailable unless explicitly registered" }
  }
}
JSON

if [[ -f "${SAWYER_PID_FILE}" ]] && kill -0 "$(cat "${SAWYER_PID_FILE}")" >/dev/null 2>&1; then
  echo "Sawyer server already running (pid $(cat "${SAWYER_PID_FILE}")) on http://${SAWYER_BIND_HOST}:${SAWYER_PORT}" >&2
  echo "Resolved provider config: ${RESOLVED_CONFIG}"
  exit 0
fi

: >"${SAWYER_LOG_FILE}"
cargo run -p sawyer-cli -- serve --bind "${SAWYER_BIND_HOST}:${SAWYER_PORT}" >>"${SAWYER_LOG_FILE}" 2>&1 &
SAWYER_PID=$!
echo "${SAWYER_PID}" >"${SAWYER_PID_FILE}"

echo "Started Sawyer server (pid ${SAWYER_PID}), waiting for /health..."
for ((i = 1; i <= SAWYER_START_TIMEOUT_SECONDS; i++)); do
  if check_http "http://${SAWYER_BIND_HOST}:${SAWYER_PORT}/health"; then
    echo "Sawyer server ready at http://${SAWYER_BIND_HOST}:${SAWYER_PORT}"
    echo "Resolved provider config: ${RESOLVED_CONFIG}"
    exit 0
  fi
  if ! kill -0 "${SAWYER_PID}" >/dev/null 2>&1; then
    echo "ERROR: Sawyer server exited before becoming ready." >&2
    echo "FIX: inspect ${SAWYER_LOG_FILE}; run cargo run -p sawyer-cli -- serve --bind ${SAWYER_BIND_HOST}:${SAWYER_PORT}" >&2
    tail -n 80 "${SAWYER_LOG_FILE}" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "ERROR: timed out waiting for Sawyer /health after ${SAWYER_START_TIMEOUT_SECONDS}s." >&2
echo "FIX: inspect ${SAWYER_LOG_FILE}; retry ./scripts/start-local-stack.sh" >&2
tail -n 80 "${SAWYER_LOG_FILE}" >&2 || true
kill "${SAWYER_PID}" >/dev/null 2>&1 || true
rm -f "${SAWYER_PID_FILE}"
exit 1
