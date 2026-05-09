# SawyerCore Troubleshooting Guide

## Common Failures and Recovery

### Service Fails to Start
**Symptoms**: Process exits immediately or fails to bind to port.
**Recovery Steps**:
1. Check terminal output for error messages
2. Verify dependencies: `npm ci` && `cargo build --workspace`
3. Check port availability: `lsof -i :$SAWYER_HTTP_PORT` (default 8080)
4. Ensure data directory is writable: `ls -ld $SAWYER_DATA_DIR`
5. Run diagnostics: `cargo run -p sawyer-cli -- doctor`

### Degraded Performance
**Symptoms**: High latency, slow response times, or frequent fallback to degraded modes.
**Recovery Steps**:
1. Check current mode: `cargo run -p sawyer-cli -- mode current`
2. Verify hardware capabilities: `npm run verify:hardware`
3. Check provider availability: `cargo run -p sawyer-cli -- compare`
4. Consider switching to a more appropriate mode: `cargo run -p sawyer-cli -- mode set <mode>`
5. Check resource usage: `cargo run -p sawyer-cli -- telemetry` (if enabled)

### Plugin Loading Failures
**Symptoms**: Errors when starting service related to plugins, or missing plugin functionality.
**Recovery Steps**:
1. Verify plugin compatibility: `npm run verify:plugins`
2. Check plugin manifest syntax: `docs/developers/plugin-manifest.md`
3. Ensure plugins are in the correct directory: `./plugins/`
4. Review plugin logs in terminal output
5. Temporarily disable plugins by removing them from plugins directory

### Database/Corruption Issues
**Symptoms**: Persistent errors about missing data, inability to save state, or inconsistent behavior.
**Recovery Steps**:
1. Backup current data directory
2. Stop service
3. Remove data directory (will be recreated on next start): `rm -rf $SAWYER_DATA_DIR`
4. Restart service: `cargo run -p sawyer-cli -- up`
5. If issue persists, check disk space and permissions

## Verification Commands

### Health Checks
```bash
# Basic API health
curl -s http://127.0.0.1:8080/status | jq .

# Explain last routing decision
curl -s http://127.0.0.1:8080/explain/last | jq .

# List available modes
cargo run -p sawyer-cli -- mode list

# Current mode
cargo run -p sawyer-cli -- mode current

# Compare providers
cargo run -p sawyer-cli -- compare
```

### Full Verification Suites
```bash
# Hardware verification
npm run verify:hardware

# Offline capability
npm run verify:offline

# Plugin safety
npm run verify:plugins

# SDK verification
npm run verify:sdk

# Marketplace verification
npm run verify:marketplace

# Complete ecosystem verification
npm run verify:ecosystem

# AI runtime verification
npm run verify:ai

# Determinism verification
npm run verify:determinism

# Low resource verification
npm run verify:low-resource

# Degraded modes verification
npm run verify:degraded-modes

# End-to-end verification
npm run verify:end-to-end

# Autonomy verification
npm run verify:autonomy

# Cost efficiency verification
npm run verify:cost-efficiency

# Security verification
npm run verify:security

# Rust-only verification
npm run verify:rust

# Repository state verification
npm run verify:repo-state

# CI health verification
npm run verify:ci-health

# Release sentinel verification
npm run verify:release
```

## Environment-Specific Issues

### WSL2
**Common Issues**:
- File system performance problems
- Networking limitations
- Access to Windows hardware (GPU, etc.)

**Solutions**:
- See `docs/install/wsl.md` for WSL-specific setup
- For GPU access, ensure WSL2 GPU drivers are installed
- Consider storing data directory on Linux filesystem (not mounted Windows drive)
- For networking, verify localhost access works: `curl http://127.0.0.1:8080`

### Windows Native
**Common Issues**:
- Antivirus interference
- Path length limitations
- Rust toolchain PATH issues

**Solutions**:
- Add exclusions for SawyerCore directories in antivirus
- Enable long paths in Windows Group Policy or via registry
- Verify Rust toolchain is in PATH: `rustc --version`
- Use Windows Terminal or PowerShell for best experience

### Linux
**Common Issues**:
- Missing system dependencies
- Permission issues with hardware access
- SELinux/AppArmor restrictions

**Solutions**:
- Install required packages: `build-essential`, `pkg-config`, `libssl-dev`
- For hardware access (GPU, NPU), ensure user is in appropriate groups (video, render, etc.)
- Check audit logs for denials: `ausearch -m avc -ts recent`
- Consider running in permissive mode temporarily for debugging

## Offline Mode Behavior

SawyerCore is designed for local-first operation:
1. No external network required for core functionality
2. If no local providers are available:
   - Service starts in degraded local mode
   - Explicit status reported via `/status` endpoint
   - Fix steps provided in logs and via `sawyer doctor`
   - No fake success or silent fallbacks
3. All verification scripts work offline
4. Plugin marketplace access requires network, but core plugin functionality works offline

## Plugin Safety

### Verification
```bash
# Verify all installed plugins
npm run verify:plugins

# Verify specific plugin
npm run verify:plugins -- --name=<plugin-name>
```

### Sandboxing
- Plugins run in restricted environment
- File system access limited to plugin directory
- Network access requires explicit plugin manifest permission
- CPU and memory usage can be constrained via plugin manifest

### Best Practices
- Only install plugins from trusted sources
- Review plugin manifests before installation
- Keep plugins updated
- Monitor plugin resource usage via telemetry
- Remove problematic plugins by deleting from plugins directory

## Release Checklist References

For release-related troubleshooting, see:
- `docs/release/process.md` for full release procedure
- `scripts/release/sentinel.ts` for release verification script
- `artifacts/release/` for latest release reports

### Release Verification
```bash
# Run release verification script
npm run verify:release

# Check release artifacts
ls -la artifacts/release/
```

## Getting Help

When seeking assistance, provide:
1. SawyerCore version: `cargo run -p sawyer-cli -- version`
2. Environment details (OS, WSL version, etc.)
3. Exact steps to reproduce
4. Terminal output from failure
5. Results of `cargo run -p sawyer-cli -- doctor`
6. Logs from service startup (if available)
7. Relevant verification command outputs

## Safety Features

SawyerCore preserves truthful degraded states:
- No silent fallbacks to unknown states
- Explicit reporting of local vs remote processing
- Deterministic behavior as default
- Localhost-first networking (external connections require explicit configuration)
- Tenant isolation prevents cross-tenant data access (when multi-tenancy enabled)