# SawyerCore Deployment Guide

## Building from Source

### Prerequisites
- Node.js >=20 (see package.json engines)
- Rust toolchain (stable)
- Git

### Build Steps
1. Clone repository
2. Install Node dependencies: `npm ci`
3. Build workspace: `cargo build --workspace`

### Release Build
```bash
cargo build --workspace --release --locked
```
Output binary: `target/release/sawyer` (CLI) and `target/release/sawyer-server` (HTTP API)

### Reproducible Build
```bash
make build-repro
```
Produces:
- `target/release/sawyer` (binary)
- `target/release/sawyer.sha256` (checksum)
- `target/release/sawyer.manifest.json` (build metadata)
- Optional GPG signature if gpg is installed

## Deployment Methods

### Method 1: Direct Execution (Development)
```bash
cargo run -p sawyer-cli -- <command>
```
Example: `cargo run -p sawyer-cli -- quickstart`

### Method 2: Installed Binary
After building, the binary can be copied to any location:
```bash
cp target/release/sawyer /usr/local/bin/
sawyer quickstart
sawyer up
```

### Method 3: Container Deployment
SawyerCore is designed for local-first execution. Container deployment is not officially supported but possible:
- Copy built binary to container image
- Set required volumes for data persistence
- Expose port 8080 for HTTP API

## Configuration

### Environment Variables
Create `.env` file (copy from `.env.example`):
- `SAWYER_MODE`: Runtime mode (tiny, local, performance, gateway, dev)
- `SAWYER_DATA_DIR`: Data directory path (default: ./data)
- `SAWYER_HTTP_PORT`: HTTP port (default: 8080)
- `SAWYER_ENABLE_TELEMETRY`: Enable telemetry (true/false, default: false)

### Runtime Modes
SawyerCore operates in predefined modes that affect resource usage and capabilities:
- `tiny`: Minimal resource footprint
- `local`: Balanced local processing
- `performance`: Maximum local performance
- `gateway`: Optimized for forwarding to remote providers
- `dev`: Development mode with extra logging

Change mode:
```bash
sawyer mode set <mode>
```

## Local Provider Setup (for testing)

### VLLM
```bash
./scripts/start-vllm.sh
```

### LiteLLM
```bash
./scripts/start-litellm.sh
```

### Llama.cpp
```bash
./scripts/start-llamacpp.sh
```

### Local Stack (all providers)
```bash
./scripts/start-local-stack.sh
```

### Smoke Test Local Stack
```bash
./scripts/smoke-local-stack.sh
```

## Verification After Deployment

### Basic Health Check
```bash
curl http://127.0.0.1:8080/status
```

### Explain Last Decision
```bash
curl http://127.0.0.1:8080/explain/last
```

### Mode Verification
```bash
sawyer mode current
sawyer compare
```

### Full Verification Suite
```bash
npm run verify:ecosystem
```

## Offline Deployment
SawyerCore is designed for offline operation:
1. No external dependencies required for core functionality
2. Local providers can be run entirely offline
3. Degraded modes explicitly reported when local providers unavailable
4. All verification scripts work offline

## Security Notes
- Binary verification: Check SHA256 against manifest
- Plugin sandboxing: Plugins run with restricted permissions
- Network: Localhost-first; external connections require explicit configuration
- Data storage: All data stored locally in SAWYER_DATA_DIR