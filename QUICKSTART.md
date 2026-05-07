# SawyerCore Operator Quickstart

## Prerequisites
- Node.js >=20 (from package.json engines)
- Rust toolchain (for cargo build)
- Git

## Local Setup
1. Clone repository
2. Install Node dependencies: `npm ci`
3. Install Rust toolchain: https://rustup.rs/
4. Build: `cargo build --workspace`

## One-Command Start
```bash
cargo run -p sawyer-cli -- quickstart
```

## Start Runtime
```bash
cargo run -p sawyer-cli -- up
```

## Verification
Check status:
```bash
cargo run -p sawyer-cli -- mode current
curl http://127.0.0.1:8080/status
curl http://127.0.0.1:8080/explain/last
```

## WSL Notes
See docs/install/wsl.md for WSL2 setup requirements.

## Environment Variables
Copy `.env.example` to `.env` and adjust:
- `SAWYER_MODE`: Runtime mode (tiny, local, performance, gateway, dev)
- `SAWYER_DATA_DIR`: Data directory path
- `SAWYER_HTTP_PORT`: HTTP port (default 8080)

## Offline Mode
SawyerCore operates local-first. If no local providers are available:
- Reports degraded status
- Provides fix steps instead of fake success
- Use `sawyer doctor` for diagnosis

## Plugin Safety
- Plugins are sandboxed
- Verify plugins: `npm run verify:plugins`
- Only load plugins from trusted sources

## Release Checklist
See docs/release/process.md for full release procedure.