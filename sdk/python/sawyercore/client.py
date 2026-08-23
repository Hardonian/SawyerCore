"""
SawyerCore Python Client Implementation.
Zero-dependency synchronous HTTP client with typed responses and truthful error handling.
"""

from __future__ import annotations
import json
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


class SawyerError(Exception):
    """Base exception for SawyerCore errors."""
    def __init__(self, message: str, status_code: Optional[int] = None, details: Any = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details


class AuthenticationError(SawyerError):
    """Raised when API key is missing or invalid."""
    def __init__(self, message: str = "Authentication failed: Invalid or missing API key"):
        super().__init__(message, status_code=401)


class QuotaExceededError(SawyerError):
    """Raised when tenant quota is exceeded."""
    def __init__(self, message: str, details: Any = None):
        super().__init__(message, status_code=429, details=details)


class ServiceDegradedError(SawyerError):
    """Raised when the engine is operating in a truthful degraded state."""
    def __init__(self, message: str, degraded_state: str, details: Any = None):
        super().__init__(message, status_code=503, details=details)
        self.degraded_state = degraded_state


class NotFoundError(SawyerError):
    """Raised when a requested resource is not found."""
    def __init__(self, resource: str):
        super().__init__(f"{resource} not found", status_code=404)


@dataclass
class TaskResult:
    id: str
    tenant_id: str
    run_id: str
    output: Any
    provider: str
    latency_ms: float
    cost_usd: float
    degraded_state: str
    tokens_used: Optional[int] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> TaskResult:
        return cls(
            id=data.get("id", ""),
            tenant_id=data.get("tenantId", ""),
            run_id=data.get("runId", ""),
            output=data.get("output"),
            provider=data.get("provider", "unknown"),
            latency_ms=data.get("latencyMs", 0.0),
            cost_usd=data.get("costUsd", 0.0),
            degraded_state=data.get("degradedState", "NOMINAL"),
            tokens_used=data.get("tokensUsed"),
        )


@dataclass
class ProviderInfo:
    name: str
    tier: str
    model_id: str
    context_window: int
    cost_per_1k_tokens: float
    available: bool
    latency_ms: Optional[float] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ProviderInfo:
        return cls(
            name=data.get("name", ""),
            tier=data.get("tier", "LOCAL_TINY"),
            model_id=data.get("modelId", ""),
            context_window=data.get("contextWindow", 4096),
            cost_per_1k_tokens=data.get("costPer1kTokens", 0.0),
            available=data.get("available", False),
            latency_ms=data.get("latencyMs"),
        )


@dataclass
class EngineStatus:
    status: str
    active_profile: str
    providers: List[ProviderInfo]

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> EngineStatus:
        providers = [ProviderInfo.from_dict(p) for p in data.get("providers", [])]
        return cls(
            status=data.get("status", "unknown"),
            active_profile=data.get("activeProfile", "local-safe"),
            providers=providers,
        )


class SawyerClient:
    """SawyerCore API Client."""

    def __init__(
        self,
        api_key: str,
        endpoint: str = "http://127.0.0.1:8787",
        timeout_seconds: float = 30.0,
    ):
        self.api_key = api_key
        self.endpoint = endpoint.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def _request(
        self,
        path: str,
        method: str = "GET",
        data: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        skip_auth: bool = False,
    ) -> Any:
        url = f"{self.endpoint}/{path.lstrip('/')}"
        req_headers = {
            "Content-Type": "application/json",
            "User-Agent": "sawyercore-python-sdk/0.1.0",
        }
        if not skip_auth and self.api_key:
            req_headers["x-api-key"] = self.api_key
        if headers:
            req_headers.update(headers)

        body_bytes = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=body_bytes, headers=req_headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=self.timeout_seconds) as resp:
                resp_text = resp.read().decode("utf-8")
                return json.loads(resp_text)
        except urllib.error.HTTPError as e:
            try:
                error_payload = json.loads(e.read().decode("utf-8"))
            except Exception:
                error_payload = {"error": str(e)}

            msg = error_payload.get("error") or error_payload.get("message") or f"HTTP {e.code}"

            if e.code == 401:
                raise AuthenticationError(msg)
            if e.code == 404:
                raise NotFoundError(path)
            if e.code == 429:
                raise QuotaExceededError(msg, details=error_payload.get("details"))
            if e.code == 503:
                degraded = error_payload.get("degradedState", "MODEL_UNAVAILABLE")
                raise ServiceDegradedError(msg, degraded_state=degraded, details=error_payload)
            raise SawyerError(msg, status_code=e.code, details=error_payload)
        except urllib.error.URLError as e:
            raise SawyerError(f"Connection failed: {e.reason}")

    def health(self) -> Dict[str, Any]:
        """Check API server health."""
        return self._request("/api/health", skip_auth=True)

    def status(self) -> EngineStatus:
        """Get engine runtime status."""
        return EngineStatus.from_dict(self._request("/api/status"))

    def providers(self) -> List[ProviderInfo]:
        """List available local and remote AI providers."""
        res = self._request("/api/providers")
        return [ProviderInfo.from_dict(p) for p in res.get("providers", [])]

    def me(self) -> Dict[str, Any]:
        """Get tenant info, quota, and billing summary."""
        return self._request("/api/me")

    def run_task(
        self,
        task_type: str,
        input_text: str,
        model: Optional[str] = None,
        parameters: Optional[Dict[str, Any]] = None,
        privacy: Optional[str] = None,
    ) -> TaskResult:
        """Execute an AI task synchronously."""
        payload: Dict[str, Any] = {
            "type": task_type,
            "input": input_text,
        }
        if model:
            payload["model"] = model
        if parameters:
            payload["parameters"] = parameters
        if privacy:
            payload["privacy"] = privacy

        res = self._request("/api/tasks", method="POST", data=payload)
        return TaskResult.from_dict(res)

    def prompt(self, prompt_text: str, model: Optional[str] = None) -> TaskResult:
        """Execute a simple chat/completion prompt."""
        return self.run_task("chat", prompt_text, model=model)
