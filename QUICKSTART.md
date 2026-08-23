# SawyerCore Operator Quickstart

## Prerequisites
- Node.js >=20 (see `package.json` engines)
- Rust toolchain (pinned to 1.90.0 via `rust-toolchain.toml`)
- Git

## Local Setup
1. Clone repository
2. Install Node dependencies: `npm ci`
3. Build Rust workspace: `cargo build --workspace`

Or use the one-command setup:
```bash
make setup
```

## Start the Server
```bash
cargo run -p sawyer-cli -- serve
```
The server starts on `http://127.0.0.1:8787` by default.

## Verification
Check status:
```bash
cargo run -p sawyer-cli -- doctor
curl http://127.0.0.1:8787/status
curl http://127.0.0.1:8787/explain/last
```

## Runtime Modes
```bash
cargo run -p sawyer-cli -- mode list
cargo run -p sawyer-cli -- mode current
```

## WSL Notes
See `docs/install/wsl.md` for WSL2 setup requirements.

## Environment Variables
Copy `.env.example` to `.env` and adjust. Key variables:
- `SAWYER_MODE`: Runtime mode (tiny, local, performance, gateway, dev)
- `SAWYER_PORT`: HTTP port (default: 8787)
- `SAWYER_PRIVATE_MODE`: Enable private mode (default: true)
- `SAWYER_CLOUD_FALLBACK`: Allow cloud fallback (default: false)

See `.env.example` for the full list.

## Offline Mode
SawyerCore operates local-first. If no local providers are available:
- Reports degraded status
- Provides fix steps instead of fake success
- Use `cargo run -p sawyer-cli -- doctor` for diagnosis

## Plugin Safety
- Plugins are sandboxed
- Verify plugins: `npm run verify:plugins`
- Only load plugins from trusted sources

## Release Checklist
See `docs/release/process.md` for full release procedure.