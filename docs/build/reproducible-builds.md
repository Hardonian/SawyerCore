# Reproducible builds

SawyerCore v1.4 adds deterministic build entry points:

- `make build-release` (release build with `--locked`)
- `make build-repro` (two consecutive deterministic builds + hash comparison)

## Determinism controls

- `Cargo.lock` is committed and build targets use `--locked`.
- `rust-toolchain.toml` pins Rust toolchain and core components.
- `SOURCE_DATE_EPOCH` is set for reproducible timestamps in build metadata where honored.
- `RUSTFLAGS` disables debug info/build-id in `build-repro` so binary hashes are stable.

## Verification

`make build-repro` writes:

- `target/release/sawyer.sha256`
- `target/release/sawyer.repro.1`
- `target/release/sawyer.repro.2`
- `target/release/sawyer.manifest.json`

Then compares hashes:

```bash
sha256sum target/release/sawyer.repro.1 target/release/sawyer.repro.2
```

## Known non-determinism

- If linker/toolchain differs across hosts, hashes may differ.
- If system C toolchain changes, reproducibility can break even from same commit.
- Optional GPG signing embeds signature packet metadata and is not expected to be byte-identical.
