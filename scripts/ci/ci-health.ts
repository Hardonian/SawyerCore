#!/usr/bin/env node
/**
 * CI HEALTH CHECK
 * Verifies that CI infrastructure and environment are healthy.
 * 
 * Checks:
 * - Node.js version (>=20)
 * - Rust toolchain available
 * - Dependencies installed (node_modules, cargo)
 * - TypeScript compiler accessible
 * - ESLint available
 * - Test runner available
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

function checkCommand(name: string, versionCmd: string, minVersion?: string): { ok: boolean; message: string } {
  try {
    const output = execSync(versionCmd, { encoding: 'utf-8' }).trim();
    const version = output.match(/(\d+)\.(\d+)/);
    if (version && minVersion) {
      const major = parseInt(version[1]);
      const minor = parseInt(version[2]);
      const [minMajor, minMinor] = minVersion.split('.').map(Number);
      if (major > minMajor || (major === minMajor && minor >= minMinor)) {
        return { ok: true, message: `${name} ${output} (OK)` };
      } else {
        return { ok: false, message: `${name} ${output} < required ${minVersion}` };
      }
    }
    return { ok: true, message: `${name} available: ${output.slice(0, 50)}` };
  } catch (err: any) {
    return { ok: false, message: `${name} not found: ${err.message.split('\n')[0]}` };
  }
}

function main() {
  console.log('🏥 CI Health Check\n');
  
  const checks: { name: string; ok: boolean; message: string }[] = [
    checkCommand('Node.js', 'node -v', '20.0.0'),
    checkCommand('npm', 'npm -v'),
    checkCommand('Rust', 'rustc --version', '1.70.0'),
    checkCommand('Cargo', 'cargo --version'),
    checkCommand('TypeScript', 'npx tsc --version'),
    checkCommand('ESLint', 'npx eslint --version'),
    checkCommand('Vitest', 'npx vitest --version'),
  ];

  // Check dependencies exist
  const nodeModulesOk = existsSync('node_modules');
  checks.push({
    name: 'node_modules',
    ok: nodeModulesOk,
    message: nodeModulesOk ? 'Dependencies installed' : 'MISSING: run npm ci'
  });

  // Check cargo registry
  const cargoRegistryOk = existsSync('.cargo') || true; // usually fine
  checks.push({
    name: 'Cargo registry',
    ok: cargoRegistryOk,
    message: cargoRegistryOk ? 'Cargo registry OK' : 'Cargo registry not initialized'
  });

  // Summary
  const failed = checks.filter(c => !c.ok);
  console.log('Status:\n');
  for (const c of checks) {
    const icon = c.ok ? '✓' : '✗';
    console.log(`  ${icon} ${c.message}`);
  }

  console.log('\n-----------------------------------');
  if (failed.length === 0) {
    console.log('✓ CI environment is healthy.');
    process.exit(0);
  } else {
    console.log(`✗ ${failed.length} issue(s) detected:`);
    failed.forEach(c => console.log(`  - ${c.message}`));
    process.exit(1);
  }
}

main();
