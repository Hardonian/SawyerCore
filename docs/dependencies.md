# Dependency audit

## Required
- Rust toolchain
- Cargo

## Optional
- llama.cpp-compatible HTTP server (`127.0.0.1:8081`)
- vLLM server (`127.0.0.1:8000`)
- LiteLLM proxy (`127.0.0.1:4000`)

## Provider-specific
- llama.cpp: local model files + HTTP serving
- vLLM: GPU-backed Python service
- LiteLLM: proxy service for model gateway use-cases

## Not required for single-binary runtime
- Node/npm
