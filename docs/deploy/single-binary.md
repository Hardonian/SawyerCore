# Single-binary deployment

Sawyer CLI builds as a Rust binary and does not require Node/npm at runtime.

## Build

```bash
cargo build -p sawyer-cli --release
```

Binary path:
- `target/release/sawyer`

## Default profiles

Profiles are shipped in `profiles/` and can be selected via runtime mode commands.

## Supported targets

- Linux x86_64 (`x86_64-unknown-linux-gnu`)
- Linux ARM64 (`aarch64-unknown-linux-gnu`)
- macOS ARM64 (`aarch64-apple-darwin`)
- Windows x86_64 (`x86_64-pc-windows-msvc`)
