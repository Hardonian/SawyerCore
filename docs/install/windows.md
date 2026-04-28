# SawyerCore install on WINDOWS

## One-shot
- Run the installer: 
  - Linux:     	scripts/install-linux.sh
  - WSL: 	scripts/install-wsl.sh
  - Termux: 	scripts/install-termux.sh
  - macOS: 	scripts/install-macos.sh
  - Windows PowerShell: 	powershell -ExecutionPolicy Bypass -File scripts/install-windows.ps1

## Security defaults
- localhost bind only
- cloud disabled
- private mode enabled
- no silent fallback

## Next steps
1. ./target/release/sawyer first-run --config ./.sawyer/config.toml
2. ./scripts/install-llamacpp.sh
3. ./scripts/start-llamacpp.sh /absolute/path/model.gguf
4. ./target/release/sawyer smoke local --config ./.sawyer/config.toml
