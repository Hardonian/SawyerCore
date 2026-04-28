#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="${ROOT_DIR}/.local-stack"
LOG_DIR="${ROOT_DIR}/.local-stack/logs"
mkdir -p "${PID_DIR}" "${LOG_DIR}"

LLAMACPP_HOST="${LLAMACPP_HOST:-127.0.0.1}"
LLAMACPP_PORT="${LLAMACPP_PORT:-8080}"
LLAMACPP_START_TIMEOUT_SECONDS="${LLAMACPP_START_TIMEOUT_SECONDS:-45}"
LLAMACPP_PID_FILE="${PID_DIR}/llamacpp.pid"
LLAMACPP_LOG_FILE="${LOG_DIR}/llamacpp.log"
LLAMACPP_MODEL_PATH="${SAWYER_LLAMACPP_MODEL_PATH:-${LLAMACPP_MODEL_PATH:-}}"

if [[ -z "${LLAMACPP_MODEL_PATH}" ]]; then
  echo "ERROR: llama.cpp model path is required." >&2
  echo "FIX: export SAWYER_LLAMACPP_MODEL_PATH=/absolute/path/to/model.gguf" >&2
  exit 1
fi

if [[ ! -f "${LLAMACPP_MODEL_PATH}" ]]; then
  echo "ERROR: GGUF model not found at ${LLAMACPP_MODEL_PATH}" >&2
  echo "FIX: set SAWYER_LLAMACPP_MODEL_PATH to an existing .gguf file" >&2
  exit 1
fi

if ! command -v llama-server >/dev/null 2>&1; then
  echo "ERROR: llama-server binary not found." >&2
  echo "FIX: install llama.cpp and ensure llama-server is on PATH" >&2
  exit 1
fi

if [[ -f "${LLAMACPP_PID_FILE}" ]] && kill -0 "$(cat "${LLAMACPP_PID_FILE}")" >/dev/null 2>&1; then
  echo "llama.cpp already running (pid $(cat "${LLAMACPP_PID_FILE}")) on http://${LLAMACPP_HOST}:${LLAMACPP_PORT}" >&2
  exit 0
fi

: >"${LLAMACPP_LOG_FILE}"
llama-server --host "${LLAMACPP_HOST}" --port "${LLAMACPP_PORT}" --model "${LLAMACPP_MODEL_PATH}" \
  >>"${LLAMACPP_LOG_FILE}" 2>&1 &
LLAMACPP_PID=$!
echo "${LLAMACPP_PID}" >"${LLAMACPP_PID_FILE}"

echo "Started llama.cpp (pid ${LLAMACPP_PID}), waiting for readiness on /health..."
for ((i = 1; i <= LLAMACPP_START_TIMEOUT_SECONDS; i++)); do
  if curl -fsS "http://${LLAMACPP_HOST}:${LLAMACPP_PORT}/health" >/dev/null 2>&1; then
    echo "llama.cpp ready at http://${LLAMACPP_HOST}:${LLAMACPP_PORT}"
    exit 0
  fi
  if ! kill -0 "${LLAMACPP_PID}" >/dev/null 2>&1; then
    echo "ERROR: llama.cpp process exited before becoming ready." >&2
    echo "FIX: inspect ${LLAMACPP_LOG_FILE} and verify model compatibility." >&2
    tail -n 50 "${LLAMACPP_LOG_FILE}" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "ERROR: timed out after ${LLAMACPP_START_TIMEOUT_SECONDS}s waiting for llama.cpp readiness." >&2
echo "FIX: check ${LLAMACPP_LOG_FILE}, then retry: ./scripts/start-llamacpp.sh" >&2
tail -n 50 "${LLAMACPP_LOG_FILE}" >&2 || true
kill "${LLAMACPP_PID}" >/dev/null 2>&1 || true
rm -f "${LLAMACPP_PID_FILE}"
exit 1
