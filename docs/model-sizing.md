# Model sizing guidance

SawyerCore recommends model class using RAM/VRAM and conservative defaults.

## Classes
- 0.5B tiny
- 1.5B lightweight
- 3B balanced
- 7B quality
- 14B+ workstation only

## Quantization
- Q4_K_M
- Q5_K_M
- Q8_0

## Rules
- RAM < 8GB: compact models only (0.5B/1.5B class)
- RAM 8-16GB: 1.5B/3B
- RAM 16-32GB: 3B/7B
- VRAM >= 24GB: 7B/14B+ classes
- Battery/thermal-sensitive systems: compact preference
- Unknown hardware: conservative recommendation

Use:

```bash
cargo run -p sawyer-cli -- quickstart
```
