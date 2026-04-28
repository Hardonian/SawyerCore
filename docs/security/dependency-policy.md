# Dependency policy

SawyerCore uses a deny-by-default posture for production additions:

- new dependencies must be reviewed for maintenance and license posture
- transitive risk is tracked via `cargo tree --workspace`
- CVE scanning can be run via `cargo audit`

## CLI integration

Run:

```bash
sawyer security audit
```

Output includes:

- `cargo audit` result (if installed)
- dependency tree generation status
- explicit note when license or unused-dependency tools are not installed

## Allowlist / denylist

Policy source-of-truth is documented in this file and can be expanded into machine-readable policy in a follow-up release.
