# Release process

Use `make release` for release discipline:

1. `make verify`
2. `make build-release`
3. `make build-repro`

This ensures formatting, linting, tests, workspace build, benchmark compile, release build,
checksum generation, manifest generation, and reproducibility check.

Optional: if GPG is installed, detached checksum signature is also produced.
