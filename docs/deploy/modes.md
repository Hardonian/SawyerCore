# Deployment modes

`DeploymentMode` values:

1. `single-node`
2. `local-cluster`
3. `airgapped`
4. `server-mode`
5. `portable-mode`

Inspect mode behavior:

```bash
sawyer deploy explain
```

Validate current config against mode invariants:

```bash
sawyer deploy validate
```

## Airgapped invariants

- localhost bind only
- `allow_network=false`
- `allow_cloud=false`
- `provider_local_only=true`

`--airgapped` on `sawyer serve` enforces the same runtime checks.
