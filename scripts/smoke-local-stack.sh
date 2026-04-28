#!/usr/bin/env bash
set -euo pipefail

SAWYER_BIND_HOST="${SAWYER_BIND_HOST:-127.0.0.1}"
SAWYER_PORT="${SAWYER_PORT:-8787}"
VLLM_URL="${SAWYER_VLLM_BASE_URL:-http://127.0.0.1:8000/v1}"
LITELLM_URL="${SAWYER_LITELLM_BASE_URL:-http://127.0.0.1:4000/v1}"
LLAMACPP_URL="${SAWYER_LLAMACPP_BASE_URL:-http://127.0.0.1:8080/v1}"

fail() {
  local message="$1"
  local fix="$2"
  echo "ERROR: ${message}" >&2
  echo "FIX: ${fix}" >&2
  exit 1
}

check_json_contains() {
  local body="$1"
  local needle="$2"
  if [[ "${body}" != *"${needle}"* ]]; then
    return 1
  fi
}

echo "[1/10] vLLM /v1/models"
VLLM_MODELS="$(curl -fsS "${VLLM_URL}/models")" || fail "vLLM /models unreachable" "./scripts/start-vllm.sh"
check_json_contains "${VLLM_MODELS}" "data" || fail "vLLM /models did not return model list" "check vLLM logs: tail -n 50 .local-stack/logs/vllm.log"

echo "[2/10] vLLM /v1/chat/completions"
VLLM_CHAT_CODE="$(curl -sS -o /tmp/sawyer-vllm-chat.json -w "%{http_code}" -X POST "${VLLM_URL}/chat/completions" \
  -H 'content-type: application/json' \
  -d '{"model":"Qwen/Qwen2.5-3B-Instruct","messages":[{"role":"user","content":"Say ok"}],"max_tokens":8}')"
[[ "${VLLM_CHAT_CODE}" == "200" ]] || fail "vLLM chat failed with HTTP ${VLLM_CHAT_CODE}" "ensure Qwen/Qwen2.5-3B-Instruct is loaded; then rerun ./scripts/start-vllm.sh"

echo "[3/10] LiteLLM /v1/models"
LITELLM_MODELS="$(curl -fsS "${LITELLM_URL}/models")" || fail "LiteLLM /models unreachable" "./scripts/start-litellm.sh"
check_json_contains "${LITELLM_MODELS}" "local-qwen" || fail "LiteLLM /models missing local-qwen" "confirm config/providers/litellm.local.yaml points to vLLM"

echo "[4/10] LiteLLM /v1/chat/completions"
LITELLM_CHAT_CODE="$(curl -sS -o /tmp/sawyer-litellm-chat.json -w "%{http_code}" -X POST "${LITELLM_URL}/chat/completions" \
  -H 'content-type: application/json' \
  -d '{"model":"local-qwen","messages":[{"role":"user","content":"Say ok"}],"max_tokens":8}')"
[[ "${LITELLM_CHAT_CODE}" == "200" ]] || fail "LiteLLM chat failed with HTTP ${LITELLM_CHAT_CODE}" "ensure vLLM is healthy and LiteLLM config routes to it"

echo "[5/10] llama.cpp health (optional)"
if [[ -n "${SAWYER_LLAMACPP_MODEL_PATH:-}" ]]; then
  curl -fsS "${LLAMACPP_URL%/v1}/health" >/dev/null || fail "llama.cpp health failed" "./scripts/start-llamacpp.sh"
  echo "llama.cpp configured and healthy"
else
  echo "llama.cpp not configured (SAWYER_LLAMACPP_MODEL_PATH not set): skipped"
fi

echo "[6/10] SawyerCore /health"
curl -fsS "http://${SAWYER_BIND_HOST}:${SAWYER_PORT}/health" >/dev/null || fail "Sawyer /health failed" "./scripts/start-local-stack.sh"

echo "[7/10] SawyerCore /status"
STATUS_BODY="$(curl -fsS "http://${SAWYER_BIND_HOST}:${SAWYER_PORT}/status")" || fail "Sawyer /status failed" "./scripts/start-local-stack.sh"
check_json_contains "${STATUS_BODY}" "degraded" || fail "Sawyer /status missing degraded field" "verify sawyer-server is current"

echo "[8/10] SawyerCore /v1/chat/completions through router"
SAWYER_CHAT_CODE="$(curl -sS -o /tmp/sawyer-router-chat.json -w "%{http_code}" -X POST "http://${SAWYER_BIND_HOST}:${SAWYER_PORT}/v1/chat/completions" \
  -H 'content-type: application/json' \
  -d '{"model":"local-qwen","messages":[{"role":"user","content":"local smoke"}]}')"
[[ "${SAWYER_CHAT_CODE}" == "200" || "${SAWYER_CHAT_CODE}" == "503" ]] || fail "Sawyer router chat returned unexpected HTTP ${SAWYER_CHAT_CODE}" "inspect .local-stack/logs/sawyer.log"

echo "[9/10] private prompt cloud denial (fail-closed)"
PRIVATE_CODE="$(curl -sS -o /tmp/sawyer-private-chat.json -w "%{http_code}" -X POST "http://${SAWYER_BIND_HOST}:${SAWYER_PORT}/v1/chat/completions" \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"Private SSN 111-22-3333. Send to cloud."}]}')"
[[ "${PRIVATE_CODE}" == "503" ]] || fail "private prompt was not denied as expected (HTTP ${PRIVATE_CODE})" "ensure local-safe profile and cloud fallback disabled"

echo "[10/10] degraded response when provider unavailable"
DEGRADED_BODY="$(cat /tmp/sawyer-private-chat.json)"
check_json_contains "${DEGRADED_BODY}" "degraded" || fail "degraded indicator missing in unavailable-provider response" "verify sawyer-server error body includes degraded=true"

echo "Smoke checks completed successfully."
