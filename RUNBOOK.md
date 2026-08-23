# SawyerCore Operator Runbook

## Service Management

### Start Service
```bash
cargo run -p sawyer-cli -- serve
```
Server binds to `http://127.0.0.1:8787` by default.

### Stop Service
Press Ctrl+C in the terminal where the service is running.

### Restart Service
1. Stop current service (Ctrl+C)
2. Start again: `cargo run -p sawyer-cli -- serve`

### Check Service Status
```bash
curl http://127.0.0.1:8787/status
```

## Configuration

### Environment Variables
Set in `.env` file (copy from `.env.example`):
- `SAWYER_MODE`: tiny|local|performance|gateway|dev (default: local-safe)
- `SAWYER_PORT`: HTTP port (default: 8787)
- `SAWYER_PRIVATE_MODE`: Enable private mode (default: true)
- `SAWYER_CLOUD_FALLBACK`: Allow cloud fallback (default: false)
- `SAWYER_ENABLE_TELEMETRY`: true|false (default: false)

See `.env.example` for the complete list.

### Runtime Modes
List available modes:
```bash
cargo run -p sawyer-cli -- mode list
```

Explain a mode:
```bash
cargo run -p sawyer-cli -- mode explain <mode>
```

Set mode:
```bash
cargo run -p sawyer-cli -- mode set <mode>
```

Current mode:
```bash
cargo run -p sawyer-cli -- mode current
```

## Verification Commands

### Hardware Verification
```bash
npm run verify:hardware
```

### Offline Capability
```bash
npm run verify:offline
```

### Plugin Safety
```bash
npm run verify:plugins
```

### SDK Verification
```bash
npm run verify:sdk
```

### Marketplace Verification
```bash
npm run verify:marketplace
```

### Full Ecosystem Verification
```bash
npm run verify:ecosystem
```

### AI Runtime Verification
```bash
npm run verify:ai
```

## Troubleshooting

### Service Won't Start
1. Check logs in terminal output
2. Verify dependencies: `npm ci` && `cargo build --workspace`
3. Check port availability: `lsof -i :8787` (Linux/macOS) or `netstat -an | findstr 8787` (Windows)
4. Run doctor: `cargo run -p sawyer-cli -- doctor`

### Degraded Performance
1. Check current mode: `cargo run -p sawyer-cli -- mode current`
2. Verify hardware: `npm run verify:hardware`
3. Check provider availability via `/status` endpoint

### Plugin Issues
1. Verify plugins: `npm run verify:plugins`
2. Check plugin compatibility with current SawyerCore version
3. Review plugin manifest: `docs/developers/plugin-manifest.md`

## Backup and Recovery

### Data Backup
Copy the data directory (SAWYER_DATA_DIR, default: ./data) to backup location.

### Data Restore
1. Stop service
2. Replace data directory with backup
3. Start service

## Logs
- Console output shows runtime logs
- Detailed logs available via telemetry when enabled
- Audit log at `SAWYER_AUDIT_LOG` (default: `./logs/sawyer-audit.jsonl`)
- Error details in terminal output when service fails

## Safety Features
- Deterministic behavior as default
- Explicit degraded states preserved
- No silent fallbacks
- Localhost-first networking
- Tenant isolation (if multi-tenancy enabled)