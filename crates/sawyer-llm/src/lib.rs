//! Local LLM adapter abstraction.

use serde::{Deserialize, Serialize};
use std::{
    io::{Read, Write},
    net::TcpStream,
    time::Duration,
};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub backend: String,
    pub available: bool,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Registry {
    pub models: Vec<ModelInfo>,
}

impl Default for Registry {
    fn default() -> Self {
        Self {
            models: vec![ModelInfo {
                id: "local-placeholder".to_string(),
                backend: "gguf-compatible".to_string(),
                available: false,
                status: "unavailable: external backend integration pending".to_string(),
            }],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub id: String,
    pub object: String,
    pub model: String,
    pub degraded: bool,
    pub message: String,
}

#[derive(Debug, Error)]
pub enum AdapterError {
    #[error("model '{0}' unavailable")]
    Unavailable(String),
}

pub trait LocalAdapter: Send + Sync {
    fn chat(&self, request: ChatRequest) -> Result<ChatResponse, AdapterError>;
}

#[derive(Default)]
pub struct UnavailableAdapter;

impl LocalAdapter for UnavailableAdapter {
    fn chat(&self, request: ChatRequest) -> Result<ChatResponse, AdapterError> {
        Err(AdapterError::Unavailable(request.model))
    }
}

pub struct LlamaCppHttpAdapter {
    endpoint: String,
    model_id: String,
}

impl LlamaCppHttpAdapter {
    pub fn new(endpoint: String, model_id: String) -> Self {
        Self { endpoint, model_id }
    }
}

impl LocalAdapter for LlamaCppHttpAdapter {
    fn chat(&self, request: ChatRequest) -> Result<ChatResponse, AdapterError> {
        let stripped = self.endpoint.strip_prefix("http://").ok_or_else(|| {
            AdapterError::Unavailable("provider endpoint must be http://".to_string())
        })?;
        let mut host_port = stripped.split('/').next().unwrap_or(stripped).split(':');
        let host = host_port.next().unwrap_or("127.0.0.1");
        let port: u16 = host_port
            .next()
            .unwrap_or("8080")
            .parse()
            .map_err(|_| AdapterError::Unavailable("invalid provider port".to_string()))?;

        let body = serde_json::json!({
            "model": self.model_id,
            "messages": request.messages,
            "stream": false
        })
        .to_string();

        let mut stream = TcpStream::connect((host, port)).map_err(|_| {
            AdapterError::Unavailable(
                "PROVIDER_UNAVAILABLE: llama.cpp server unreachable".to_string(),
            )
        })?;
        let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
        let req = format!(
            "POST /v1/chat/completions HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream
            .write_all(req.as_bytes())
            .map_err(|_| AdapterError::Unavailable("failed writing to provider".to_string()))?;
        let mut raw = String::new();
        stream.read_to_string(&mut raw).map_err(|_| {
            AdapterError::Unavailable("failed reading provider response".to_string())
        })?;

        if !raw.starts_with("HTTP/1.1 200") {
            return Err(AdapterError::Unavailable(
                "provider returned non-200 status".to_string(),
            ));
        }

        let body = raw
            .split("\r\n\r\n")
            .nth(1)
            .ok_or_else(|| AdapterError::Unavailable("provider response malformed".to_string()))?;
        let content = serde_json::from_str::<serde_json::Value>(body)
            .ok()
            .and_then(|v| {
                v.get("choices")?
                    .get(0)?
                    .get("message")?
                    .get("content")?
                    .as_str()
                    .map(str::to_string)
            })
            .unwrap_or_else(|| "provider returned no content".to_string());

        Ok(ChatResponse {
            id: "chatcmpl-local".to_string(),
            object: "chat.completion".to_string(),
            model: self.model_id.clone(),
            degraded: false,
            message: content,
        })
    }
}
