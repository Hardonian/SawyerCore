# Operator Guide: Plugin Marketplace

## Marketplace Principles

- **Security First**: All plugins run in isolated sandboxes.
- **Auditable**: Every installation and update is logged.
- **Reversible**: One-click rollback for any failed deployment.

## Installation Workflow

1. **Discovery**: Identify plugin from `catalog.ts`.

## Deployment Security

1. **Validation**: Check signature and checksum.
2. **Permission Review**: Operators MUST review and approve requested permissions (Network, Filesystem, AI).
3. **Sandboxed Execution**: Plugins are initialized in isolated `node:vm` contexts.

## Rollback Policy

If a plugin installation fails or the plugin causes system instability, the installer maintains a `.backup` of the previous stable version. A rollback is triggered automatically if the `init` hook fails.

## Health Monitoring
Operators can monitor plugin resource usage (CPU/Memory) via the `AutonomyContract` dashboard. Plugins exceeding their `resourceLimits` will be throttled or terminated.
