# Security Model

SawyerCore follows a **Zero Trust** architecture for third-party plugins.

## Isolation Principles

1. **Deny by Default**: Plugins start with zero permissions. Any capability (network, disk, AI) must be explicitly declared in the manifest and approved by the operator/user.
2. **Sandbox Enforcement**: Plugins run in a restricted `node:vm` context. They cannot access the global scope of the host process.
3. **Resource Ceilings**: Hard limits on CPU and Memory prevent runaway plugins from impacting the host system's stability.
4. **No Direct Secret Access**: Plugins never see API keys or database credentials. They interact with protected resources via proxied, permission-checked APIs.

## Permission Review

Upon installation via the Marketplace, the system displays a "Permission Request" to the user, highlighting:

- Requested network domains
- Requested filesystem paths
- AI runtime access levels

## Signature Verification
(Coming Soon)
Future versions will require plugins to be signed by a trusted authority to prevent tampering during transit.
