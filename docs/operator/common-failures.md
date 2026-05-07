# SawyerCore Operator Common Failures

## Startup Failures

### Port Already in Use
**Symptoms**: Service fails to start with address already in use error.
**Detection**: 
- Terminal shows "Address already in use" error
- `lsof -i :8080` shows process listening on port
**Recovery**:
1. Identify conflicting process: `lsof -i :8080`
2. Stop conflicting process or change SawyerCore port:
   ```bash
   # Change port in .env
   SAWYER_HTTP_PORT=8081
   ```
3. Restart service

### Missing Dependencies
**Symptoms**: Service fails to start with module not found errors.
**Detection**:
- Terminal shows "Cannot find module" or similar errors
- `npm ci` or `cargo build` fails
**Recovery**:
1. Install Node dependencies: `npm ci`
2. Install Rust toolchain: https://rustup.rs/
3. Build workspace: `cargo build --workspace`

### Data Directory Permissions
**Symptoms**: Service starts but fails to save state or logs permission errors.
**Detection**:
- Terminal shows EACCES or permission denied errors
- Unable to write to SAWYER_DATA_DIR
**Recovery**:
1. Check directory permissions: `ls -ld $SAWYER_DATA_DIR`
2. Fix permissions: `chmod u+rw $SAWYER_DATA_DIR`
3. Or change directory: Update SAWYER_DATA_DIR in .env to writable location

## Runtime Failures

### Provider Unavailable
**Symptoms**: Service runs but shows degraded status, AI tasks fail or fallback unexpectedly.
**Detection**:
- `/status` endpoint shows degraded local status
- Logs show provider unavailable warnings
- Tasks take longer than expected or fail
**Recovery**:
1. Check provider status: `cargo run -p sawyer-cli -- compare`
2. Start local providers if needed:
   ```bash
   # VLLM
   ./scripts/start-vllm.sh
   
   # LiteLLM  
   ./scripts/start-litellm.sh
   
   # Llama.cpp
   ./scripts/start-llamacpp.sh
   ```
3. Verify provider availability after starting
4. Consider adjusting mode: `cargo run -p sawyer-cli -- mode set local`

### High Resource Usage
**Symptoms**: System becomes unresponsive, high CPU/memory usage detected.
**Detection**:
- System monitoring shows high resource consumption
- Service responsiveness degrades
- Other applications affected
**Recovery**:
1. Check current mode: `cargo run -p sawyer-cli -- mode current`
2. Switch to more conservative mode:
   ```bash
   cargo run -p sawyer-cli -- mode set tiny
   ```
3. Verify hardware limits: `npm run verify:hardware`
4. Check for runaway processes: `ps aux | grep sawyer`
5. Restart with resource limits if needed

### Plugin Conflicts
**Symptoms**: Service behaves unexpectedly after installing/updating plugins.
**Detection**:
- New errors in logs after plugin change
- Specific functionality broken
- Service instability
**Recovery**:
1. Verify plugins: `npm run verify:plugins`
2. Remove recently added/plugin causing issues
3. Check plugin compatibility with SawyerCore version
4. Review plugin manifests for conflicting permissions
5. Restart service after plugin removal

## Network Failures

### Localhost Connection Refused
**Symptoms**: Unable to connect to SawyerCore HTTP API.
**Detection**:
- `curl http://127.0.0.1:8080/status` fails with connection refused
- Service appears not to be listening on expected port
**Recovery**:
1. Verify service is running: `ps aux | grep sawyer`
2. Check service output for startup errors
3. Verify port binding: `lsof -i :8080` (or configured port)
4. Check firewall settings blocking localhost
5. Restart service: `cargo run -p sawyer-cli -- up`

### External Provider Connection Issues
**Symptoms**: Configured external providers fail to respond.
**Detection**:
- Logs show timeout or connection errors to external endpoints
- Tasks fail when attempting to use external providers
- `/explain/last` shows routing to failed providers
**Recovery**:
1. Verify external endpoint accessibility: `curl <external-endpoint>`
2. Check API keys and credentials in .env
3. Verify network connectivity and firewall rules
4. Check external provider status/documentation
5. Temporarily disable external provider usage to isolate issue
6. Consider switching to local-only mode for testing

## Data Failures

### Corrupted Data Directory
**Symptoms**: Service behaves erratically, fails to load previous state.
**Detection**:
- Errors about invalid data format or corrupted files
- Inconsistent behavior across restarts
- Missing expected data or state
**Recovery**:
1. Backup current data directory
2. Stop service
3. Remove corrupted data: `rm -rf $SAWYER_DATA_DIR/*` (preserve directory structure)
4. Restart service - will create fresh data directory
5. If problem persists, check disk health: `chkdsk` / `fsck`

### Disk Space Exhaustion
**Symptoms**: Service fails to write logs, state, or cache files.
**Detection**:
- "No space left on device" errors in logs
- Service operations fail intermittently
- System low disk space warnings
**Recovery**:
1. Check disk usage: `df -h` (Linux/Mac) or explore disk usage (Windows)
2. Identify space consumers in SAWYER_DATA_DIR: `du -sh $SAWYER_DATA_DIR/*`
3. Clean old data:
   - Logs: Safe to delete old log files
   - Cache: Can clear cache directory
   - Consider adjusting data retention policies
4. Free up disk space or move data directory to larger volume
5. Restart service

## Verification Failures

### Hardware Verification Failures
**Symptoms**: `npm run verify:hardware` fails.
**Detection**:
- Verification script exits with error code
- Specific hardware component reported as insufficient or unavailable
**Recovery**:
1. Review verification output for specific failing component
2. Check if hardware actually present: `lspci`, `lsusb`, system info
3. Verify drivers are installed and functioning
4. For missing optional hardware, verification failure may be expected
5. Consider adjusting SawyerCore mode to match available hardware: `cargo run -p sawyer-cli -- mode set <mode>`

### Plugin Verification Failures
**Symptoms**: `npm run verify:plugins` fails.
**Detection**:
- Verification reports plugin safety or compatibility issues
- Specific plugins flagged as problematic
**Recovery**:
1. Review verification output for specific plugin issues
2. Check plugin manifests for syntax errors or excessive permissions
3. Update problematic plugins to compatible versions
4. Remove plugins that cannot be made compliant
5. Re-run verification after changes

## Getting Help

When documenting failures for support:
1. Record exact error messages from terminal/logs
2. Note SawyerCore version: `cargo run -p sawyer-cli -- version`
3. Document environment (OS, WSL version, hardware specs)
4. List steps to reproduce failure
5. Include output of `cargo run -p sawyer-cli -- doctor`
6. Provide relevant verification command outputs
7. Share relevant portions of .env (excluding secrets)