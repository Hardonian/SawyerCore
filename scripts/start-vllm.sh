#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="${ROOT_DIR}/.local-stack"
LOG_DIR="${ROOT_DIR}/.local-stack/logs"
mkdir -p "${PID_DIR}" "${LOG_DIR}"

VLLM_HOST="${VLLM_HOST:-127.0.0.1}"
VLLM_PORT="${VLLM_PORT:-8000}"
VLLM_MODEL="${VLLM_MODEL:-Qwen/Qwen2.5-3B-Instruct}"
VLLM_START_TIMEOUT_SECONDS="${VLLM_START_TIMEOUT_SECONDS:-180}"
VLLM_PID_FILE="${PID_DIR}/vllm.pid"
VLLM_LOG_FILE="${LOG_DIR}/vllm.log"

if ! command -v python >/dev/null 2>&1; then
  echo "ERROR: python is required for vLLM startup." >&2
  echo "FIX: install Python 3 and vLLM: pip install vllm" >&2
  exit 1
fi

if ! python -c 'import vllm' >/dev/null 2>&1; then
  echo "ERROR: vLLM Python package is not installed." >&2
  echo "FIX: pip install vllm" >&2
  exit 1
fi

if [[ -f "${VLLM_PID_FILE}" ]] && kill -0 "$(cat "${VLLM_PID_FILE}")" >/dev/null 2>&1; then
  echo "vLLM already running (pid $(cat "${VLLM_PID_FILE}")) on http://${VLLM_HOST}:${VLLM_PORT}" >&2
  exit 0
fi

: >"${VLLM_LOG_FILE}"
python -m vllm.entrypoints.openai.api_server \
  --host "${VLLM_HOST}" \
  --port "${VLLM_PORT}" \
  --model "${VLLM_MODEL}" \
  >>"${VLLM_LOG_FILE}" 2>&1 &
VLLM_PID=$!
echo "${VLLM_PID}" >"${VLLM_PID_FILE}"

echo "Started vLLM (pid ${VLLM_PID}), waiting for readiness on /v1/models..."
for ((i = 1; i <= VLLM_START_TIMEOUT_SECONDS; i++)); do
  if curl -fsS "http://${VLLM_HOST}:${VLLM_PORT}/v1/models" >/dev/null 2>&1; then
    echo "vLLM ready at http://${VLLM_HOST}:${VLLM_PORT}/v1"
    exit 0
  fi
  if ! kill -0 "${VLLM_PID}" >/dev/null 2>&1; then
    echo "ERROR: vLLM process exited before becoming ready." >&2
    echo "FIX: inspect log ${VLLM_LOG_FILE} and verify model '${VLLM_MODEL}' is accessible." >&2
    tail -n 50 "${VLLM_LOG_FILE}" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "ERROR: timed out after ${VLLM_START_TIMEOUT_SECONDS}s waiting for vLLM readiness." >&2
echo "FIX: check ${VLLM_LOG_FILE}, then retry: ./scripts/start-vllm.sh" >&2
tail -n 50 "${VLLM_LOG_FILE}" >&2 || true
kill "${VLLM_PID}" >/dev/null 2>&1 || true
rm -f "${VLLM_PID_FILE}"
exit 1
