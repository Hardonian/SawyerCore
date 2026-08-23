"""
FastAPI Microservice integrating SawyerCore Python SDK.
Exposes async AI endpoints with proper error handling and health checks.
"""

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
from typing import Optional, Any
import os
import sys

# Add sdk/python to path for local development
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../sdk/python')))
from sawyercore import SawyerClient, ServiceDegradedError, QuotaExceededError

app = FastAPI(title="SawyerCore FastAPI Worker", version="0.1.0")

client = SawyerClient(
    api_key=os.getenv("SAWYER_API_KEY", "test-key"),
    endpoint=os.getenv("SAWYER_ENDPOINT", "http://127.0.0.1:8787"),
)


class ChatRequest(BaseModel):
    prompt: str
    model: Optional[str] = None
    privacy: Optional[str] = "private"


class ChatResponse(BaseModel):
    success: bool
    output: Any
    provider: str
    latency_ms: float
    degraded_state: str


@app.get("/health")
def health_check():
    try:
        return client.health()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Sawyer engine unreachable: {str(e)}",
        )


@app.post("/chat", response_model=ChatResponse)
def execute_chat(req: ChatRequest):
    try:
        result = client.run_task(
            task_type="chat",
            input_text=req.prompt,
            model=req.model,
            privacy=req.privacy,
        )
        return ChatResponse(
            success=True,
            output=result.output,
            provider=result.provider,
            latency_ms=result.latency_ms,
            degraded_state=result.degraded_state,
        )
    except ServiceDegradedError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": e.message,
                "degradedState": e.degraded_state,
                "recovery": "Local provider offline; start model backend and retry.",
            },
        )
    except QuotaExceededError as e:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=e.message,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
