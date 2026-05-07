# SawyerCore Security Guide

## Security Model

### Local-First Posture
- SawyerCore operates with localhost-first networking as default
- External connections require explicit configuration and user consent
- No automatic cloud fallback or silent remote processing
- All data processing occurs locally unless explicitly configured otherwise

### Tenant Isolation
- Strict tenant isolation prevents cross-tenant data access
- Resource partitions prevent tenant data leakage
- Rate limiting per tenant
- Scope-based permission enforcement

### Deterministic Behavior
- Deterministic behavior as the default
- Never claim model, SIMD, or GPU support when unavailable
- Preserve truthful degraded states in CLI and HTTP responses
- Explicit errors over silent fallback

## Environment Variables for Security

### Core Security Settings
- `SAWYER_ENABLE_TELEMETRY`: Enable/disable telemetry collection (default: false)
- `SAWYER_MODE`: Runtime mode affecting security posture (tiny, local, performance, gateway, dev)
- `SAWYER_DATA_DIR`: Controls where sensitive data is stored

### API Security
- API key auth via `x-api-key` header for public endpoints
- Scope-based access control for API endpoints
- Tenant management for multi-tenant deployments
- Referral system with security considerations

## Plugin Security

### Plugin Sandboxing
- Plugins run in restricted environments
- File system access limited to plugin directory
- Network access requires explicit permission in plugin manifest
- Plugin manifests define required permissions

### Plugin Verification
```bash
# Verify plugin safety
npm run verify:plugins
```

### Best Practices
- Only install plugins from trusted sources
- Review plugin manifests before installation
- Monitor plugin behavior via telemetry
- Remove suspicious plugins immediately

## Data Protection

### Data at Rest
- All data stored locally in SAWYER_DATA_DIR
- No automatic data transmission to external servers
- Users responsible for securing their data directory
- Consider disk encryption for sensitive deployments

### Data in Transit
- Localhost-only communication by default
- External API calls use standard TLS/TLS when configured
- API keys should be stored securely and not committed to repositories
- Use .env files for secrets, never commit to version control

## Verification and Auditing

### Security Verification
```bash
# Run security verification suite
npm run verify:security
```

### Binary Verification
- Reproducible builds with SHA256 verification
- GPG signatures available for release binaries
- Verify binary integrity before execution:
  ```bash
  sha256sum sawyer
  # Compare with manifest: target/release/sawyer.manifest.json
  ```

### Dependency Security
- Regular dependency auditing
- No secrets in repository; use .env.example only
- Dependency policy documented in docs/security/dependency-policy.md
- Binary verification in docs/security/binary-verification.md

## Configuration Security

### Safe Defaults
- Cloud disabled by default (local-safe posture)
- Runtime modes designed for explicit resource control
- Hardware-aware scheduling prevents overcommitment
- Policy engine enforces resource-aware constraints

### Hardening Options
- Run in `tiny` mode for minimal attack surface
- Disable telemetry: `SAWYER_ENABLE_TELEMETRY=false`
- Restrict network bindings via SAWYER_HTTP_PORT and firewall rules
- Limit plugin directory access

## Incident Response

### Suspected Compromise
1. Immediately stop the SawyerCore service
2. Isolate the affected system from network if external connections configured
3. Review logs for anomalous behavior
4. Check plugin directory for unauthorized plugins
5. Verify binary integrity using SHA256 from manifest
6. Review environment variables for unexpected changes
7. Consider rebuilding from source if compromise suspected

### Data Breach
1. Identify what data was stored in SAWYER_DATA_DIR
2. Assess sensitivity of stored data (prompts, outputs, configuration)
3. Notify affected parties according to data protection regulations
4. Rotate any API keys or credentials that may have been exposed
5. Review access logs if audit logging enabled

## Compliance and Standards

### Privacy
- GDPR-compatible data handling (data remains local unless explicitly exported)
- Right to deletion via data directory removal
- Data minimization through configurable data retention

### Security Standards
- Defense in depth through multiple security layers
- Principle of least privilege in plugin system
- Secure by default configuration
- Regular security verification through automated tests

## Reporting Security Issues

Please report security vulnerabilities through the appropriate channels:
- Do NOT open public issues for security vulnerabilities
- Contact maintainers through private channels disclosed in SECURITY policy
- Follow responsible disclosure practices

## Additional Resources

- Architecture security details: docs/architecture/governance-policy.md
- Developer security model: docs/developers/security-model.md
- Binary verification process: docs/security/binary-verification.md
- Dependency policy: docs/security/dependency-policy.md