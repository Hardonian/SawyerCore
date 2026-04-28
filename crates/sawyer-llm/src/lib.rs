//! Local LLM adapter abstraction.

use serde::{Deserialize, Serialize};
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
