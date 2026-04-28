#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_DIR="${ROOT_DIR}/.local-stack"
LOG_DIR="${ROOT_DIR}/.local-stack/logs"
mkdir -p "${PID_DIR}" "${LOG_DIR}"

LITELLM_HOST="${LITELLM_HOST:-127.0.0.1}"
LITELLM_PORT="${LITELLM_PORT:-4000}"
LITELLM_START_TIMEOUT_SECONDS="${LITELLM_START_TIMEOUT_SECONDS:-45}"
LITELLM_PID_FILE="${PID_DIR}/litellm.pid"
LITELLM_LOG_FILE="${LOG_DIR}/litellm.log"
LITELLM_CONFIG_FILE="${LITELLM_CONFIG_FILE:-${ROOT_DIR}/config/providers/litellm.local.yaml}"

if ! command -v litellm >/dev/null 2>&1; then
  echo "ERROR: litellm command is not available." >&2
  echo "FIX: pip install 'litellm[proxy]'" >&2
  exit 1
fi

if [[ ! -f "${LITELLM_CONFIG_FILE}" ]]; then
  echo "ERROR: LiteLLM config file not found at ${LITELLM_CONFIG_FILE}" >&2
  echo "FIX: restore config/providers/litellm.local.yaml" >&2
  exit 1
fi

if [[ -f "${LITELLM_PID_FILE}" ]] && kill -0 "$(cat "${LITELLM_PID_FILE}")" >/dev/null 2>&1; then
  echo "LiteLLM already running (pid $(cat "${LITELLM_PID_FILE}")) on http://${LITELLM_HOST}:${LITELLM_PORT}" >&2
  exit 0
fi

: >"${LITELLM_LOG_FILE}"
litellm --host "${LITELLM_HOST}" --port "${LITELLM_PORT}" --config "${LITELLM_CONFIG_FILE}" \
  >>"${LITELLM_LOG_FILE}" 2>&1 &
LITELLM_PID=$!
echo "${LITELLM_PID}" >"${LITELLM_PID_FILE}"

echo "Started LiteLLM (pid ${LITELLM_PID}), waiting for readiness on /v1/models..."
for ((i = 1; i <= LITELLM_START_TIMEOUT_SECONDS; i++)); do
  if curl -fsS "http://${LITELLM_HOST}:${LITELLM_PORT}/v1/models" >/dev/null 2>&1; then
    echo "LiteLLM ready at http://${LITELLM_HOST}:${LITELLM_PORT}/v1"
    exit 0
  fi
  if ! kill -0 "${LITELLM_PID}" >/dev/null 2>&1; then
    echo "ERROR: LiteLLM process exited before becoming ready." >&2
    echo "FIX: inspect log ${LITELLM_LOG_FILE}; ensure vLLM is reachable at http://127.0.0.1:8000/v1" >&2
    tail -n 50 "${LITELLM_LOG_FILE}" >&2 || true
    exit 1
  fi
  sleep 1
done

echo "ERROR: timed out after ${LITELLM_START_TIMEOUT_SECONDS}s waiting for LiteLLM readiness." >&2
echo "FIX: check ${LITELLM_LOG_FILE}, then retry: ./scripts/start-litellm.sh" >&2
tail -n 50 "${LITELLM_LOG_FILE}" >&2 || true
kill "${LITELLM_PID}" >/dev/null 2>&1 || true
rm -f "${LITELLM_PID_FILE}"
exit 1
