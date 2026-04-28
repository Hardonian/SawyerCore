# Binary verification

## Artifacts

`make build-repro` creates:

- `target/release/sawyer.sha256`
- `target/release/sawyer.manifest.json`
- optional `target/release/sawyer.sha256.asc` (if GPG installed)

Manifest fields:

- `binary_sha256`
- `version`
- `commit_hash`
- `build_timestamp_unix`

## Verify a binary

```bash
sawyer verify-binary ./target/release/sawyer --manifest ./target/release/sawyer.manifest.json
```

The command recomputes SHA256 and fails on mismatch.

## Optional GPG

If `gpg` is available, detached signatures are generated for checksum files.
This is optional and is not required for local development.
