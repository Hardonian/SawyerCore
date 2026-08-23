/**
 * Cross-platform Rust verification script.
 * Replaces verify-rust-only.sh — works on Windows, Linux, and macOS.
 */

import { execSync } from 'child_process';

const steps = [
  { name: 'cargo fmt --check', cmd: 'cargo fmt --all --check' },
  { name: 'cargo clippy', cmd: 'cargo clippy --workspace --all-targets -- -D warnings' },
  { name: 'cargo test', cmd: 'cargo test --workspace' },
  { name: 'cargo build', cmd: 'cargo build --workspace' },
];

let failed = false;

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  try {
    execSync(step.cmd, { stdio: 'inherit', cwd: process.cwd() });
    console.log(`✅ ${step.name} passed`);
  } catch {
    console.error(`❌ ${step.name} FAILED`);
    failed = true;
    break; // Stop on first failure (fail-fast)
  }
}

if (failed) {
  console.error('\nRust verification FAILED.');
  process.exit(1);
} else {
  console.log('\nRust verification completed (JS checks skipped by design).');
}
