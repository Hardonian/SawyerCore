# Operator Guide: Plugin Marketplace

This guide covers the management and security of the SawyerCore plugin ecosystem.

## Installation Flow
1. **Discovery**: Operators can search the local or remote catalog.
2. **Verification**: The system verifies the plugin's manifest and checksum.
3. **Permission Review**: Operators MUST review and approve requested permissions (Network, Filesystem, AI).
4. **Sandboxed Execution**: Plugins are initialized in isolated `node:vm` contexts.

## Rollback Policy
If a plugin installation fails or the plugin causes system instability, the installer maintains a `.backup` of the previous stable version. A rollback is triggered automatically if the `init` hook fails.

## Health Monitoring
Operators can monitor plugin resource usage (CPU/Memory) via the `AutonomyContract` dashboard. Plugins exceeding their `resourceLimits` will be throttled or terminated.
