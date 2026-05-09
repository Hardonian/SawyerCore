# SawyerCore Operator Degraded States

## Understanding Degraded States

SawyerCore is designed to preserve truthful degraded states and never provide silent fallbacks or fake success.
When the system cannot operate at full capacity, it explicitly reports the degradation and provides guidance.

## Local Provider Unavailability

### State: LOCAL_DEGRADED
**Symptoms**:
- `/status` endpoint reports `local: degraded`
- Logs indicate no local providers available
- AI tasks may fail or show extended latency
- System continues to operate but with reduced local AI capability

**Detection**:
```bash
curl -s http://127.0.0.1:8080/status | jq .
# Look for "local": { "status": "degraded" }
```

**Recovery**:
1. Start local providers:
   ```bash
   # Start VLLM (if configured)
   ./scripts/start-vllm.sh
   
   # Start LiteLLM
   ./scripts/start-litellm.sh
   
   # Start Llama.cpp
   ./scripts/start-llamacpp.sh
   ```
2. Verify provider availability:
   ```bash
   cargo run -p sawyer-cli -- compare
   ```
3. Check status returns to healthy:
   ```bash
   curl -s http://127.0.0.1:8080/status | jq .
   ```

## Hardware Limitations

### State: RESOURCE_CONSTRAINED
**Symptoms**:
- System runs but at reduced performance
- Frequent switching to conservative modes
- Logs show resource throttling warnings
- `/status` may show resource pressure indicators

**Detection**:
```bash
# Check current mode
cargo run -p sawyer-cli -- mode current

# Verify hardware verification
npm run verify:hardware
```

**Recovery**:
1. Explicitly set appropriate mode for hardware:
   ```bash
   cargo run -p sawyer-cli -- mode set tiny   # For constrained hardware
   cargo run -p sawyer-cli -- mode set local  # For balanced hardware
   cargo run -p sawyer-cli -- mode set performance # For capable hardware
   ```
2. Monitor resource usage via telemetry if enabled
3. Consider upgrading hardware if consistently constrained

## Network Isolation

### State: OFFLINE_MODE
**Symptoms**:
- System operates without external network connectivity
- Local functionality preserved
- External provider attempts fail gracefully
- `/status` shows external: unreachable (if applicable)

**Detection**:
```bash
# Attempt to reach known external endpoint (if configured)
curl -I https://api.example.com  # Should timeout or fail

# Check SawyerCore status - should still show local healthy
curl -s http://127.0.0.1:8080/status | jq .
```

**Recovery**:
1. Verify this is expected (SawyerCore designed for local-first)
2. If external connectivity required:
   - Check network cables, WiFi, VPN
   - Verify firewall rules allow outbound connections
   - Check DNS resolution: `nslookup api.example.com`
   - Verify proxy settings if required
3. SawyerCore will continue to operate with local-only functionality

## Plugin Failures

### State: PLUGIN_DEGRADED
**Symptoms**:
- Specific plugin functionality missing or broken
- Logs show plugin load/execution errors
- Core SawyerCore functionality unaffected
- `/status` may show plugin warnings

**Detection**:
```bash
# Check plugin verification
npm run verify:plugins

# Review service logs for plugin errors
```

**Recovery**:
1. Identify problematic plugin from logs
2. Remove or update the plugin:
   ```bash
   # Remove plugin
   rm -rf ./plugins/problematic-plugin
   
   # Or update plugin
   cd ./plugins/problematic-plugin && npm update
   ```
3. Verify plugins after change: `npm run verify:plugins`
4. Restart service to load clean plugin set

## Data Directory Issues

### State: DATA_DIR_ISSUE
**Symptoms**:
- Errors reading/writing to data directory
- Service may start but fail to persist state
- Logs show EACCES, ENOSPC, or I/O errors
- Inconsistent behavior across restarts

**Detection**:
```bash
# Check data directory accessibility
ls -la $SAWYER_DATA_DIR

# Check disk space
df -h $SAWYER_DATA_DIR

# Look for specific errors in service logs
```

**Recovery**:
1. Fix permissions: `chmod u+rw $SAWYER_DATA_DIR`
2. Free disk space: remove unnecessary files or expand volume
3. Repair filesystem if indicated: `chkdsk` / `fsck`
4. Consider relocating data directory to healthier volume:
   ```bash
   # Change SAWYER_DATA_DIR in .env to new location
   # Copy existing data if needed
   # Restart service
   ```

## Configuration Errors

### State: CONFIG_INVALID
**Symptoms**:
- Service fails to start or starts with limited functionality
- Logs show configuration parsing errors
- Invalid environment variable values
- Missing required configuration

**Detection**:
```bash
# Check service startup logs for configuration errors
# Verify .env file contents
cat .env

# Validate configuration with doctor
cargo run -p sawyer-cli -- doctor
```

**Recovery**:
1. Correct invalid configuration values in .env
2. Refer to documentation for valid values:
   - SAWYER_MODE: tiny, local, performance, gateway, dev
   - SAWYER_HTTP_PORT: valid port number (1-65535)
   - SAWYER_DATA_DIR: absolute or relative path string
   - SAWYER_ENABLE_TELEMETRY: true or false
3. Restart service after correction

## Verification of Degraded States

### Using Doctor for Diagnosis
```bash
# Comprehensive system check
cargo run -p sawyer-cli -- doctor

# JSON output for automation
cargo run -p sawyer-cli -- doctor --json
```

### Status Endpoint
```bash
# Basic status
curl -s http://127.0.0.1:8080/status

# Detailed explanation of last routing decision
curl -s http://127.0.0.1:8080/explain/last
```

### Mode Verification
```bash
# List available modes
cargo run -p sawyer-cli -- mode list

# Explain specific mode
cargo run -p sawyer-cli -- mode explain <mode>

# Get current mode
cargo run -p sawyer-cli -- mode current
```

## Recovery Procedure for Unknown Degraded State

1. Run doctor: `cargo run -p sawyer-cli -- doctor`
2. Check service logs for error patterns
3. Verify core functionality: `curl http://127.0.0.1:8080/status`
4. Check mode: `cargo run -p sawyer-cli -- mode current`
5. Verify providers: `cargo run -p sawyer-cli -- compare`
6. Check plugins: `npm run verify:plugins`
7. Validate configuration: review .env and docs
8. Consider safe restart: stop service, clear temporary caches, start again
9. If persistent, backup data and perform clean reinstall

## Safety Notes

- SawyerCore never claims capabilities it doesn't have
- Degraded states are explicitly reported, never hidden
- Local-first operation ensures core functionality remains available
- Recovery procedures focus on restoring known-good state
- When in doubt, revert to `tiny` mode for minimal resource usage