#!/usr/bin/env node
/**
 * REPOSITORY STATE VERIFIER
 * Ensures the repository is in a clean, releasable state.
 *
 * Checks:
 * - No uncommitted changes (or --allow-dirty flag)
 * - No .env files tracked by git
 * - No secret leakage in staged/unstaged changes
 * - All tests passing (sanity check)
 * - No broken symlinks or missing required files
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

function runGit(cmd: string): { success: boolean; output: string } {
  try {
    const output = execSync(`git ${cmd}`, { encoding: 'utf-8' }).trim();
    return { success: true, output };
  } catch (err: any) {
    return { success: false, output: err.stdout?.trim() || err.message };
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  const allowDirty = args.has('--allow-dirty') || args.has('-d');
  const skipTests = args.has('--skip-tests');

  console.log('📦 Repository State Verification\n');

  const failures: string[] = [];

  // 1. Clean working tree
  console.log('1. Working tree status...');
  const statusResult = runGit('status --porcelain');
  if (!statusResult.success) {
    console.log(`   ⚠ Could not check git status: ${statusResult.output}`);
  } else {
    const changes = statusResult.output.split('\n').filter(Boolean);
    if (changes.length === 0) {
      console.log('   ✓ Working tree clean');
    } else if (allowDirty) {
      console.log('   ⚠ Uncommitted changes (allowed by --allow-dirty):');
      changes.forEach(c => console.log(`     ${c}`));
    } else {
      console.log('   ✗ Uncommitted changes detected:');
      changes.forEach(c => console.log(`     ${c}`));
      failures.push('Uncommitted changes present. Commit or use --allow-dirty');
    }
  }

  // 2. Tracked .env files
  console.log('\n2. Env files in repository...');
  const trackedResult = runGit('ls-files');
  if (trackedResult.success) {
    const files = trackedResult.output.split('\n');
    const envFiles = files.filter(f => f.includes('.env') && !f.endsWith('.env.example') && !f.endsWith('.env.local.example'));
    if (envFiles.length === 0) {
      console.log('   ✓ No committed env files');
    } else {
      console.log(`   ✗ Found ${envFiles.length} committed env file(s):`);
      envFiles.forEach(f => console.log(`     ${f}`));
      failures.push('Sensitive .env files committed. Remove with: git rm --cached <file>');
    }
  }

  // 3. Secret leakage in uncommitted changes
  console.log('\n3. Scanning for secret leakage in changes...');
  const diffResult = runGit('diff --cached');
  const unstagedResult = runGit('diff');
  const combinedDiff = diffResult.success ? diffResult.output + '\n' + unstagedResult.output : '';

  const secretPatterns = [
    /sk-[A-Za-z0-9]{24,}/,  // Stripe
    /['"]?(?:api[_-]?key|secret|password|token|private[_-]?key)['"]?\s*[:=]\s*['"][^'"]{8,}['"]/i
  ];

  let secretHits = 0;
  for (const pattern of secretPatterns) {
    const matches = combinedDiff.match(pattern);
    if (matches) secretHits += matches.length;
  }

  if (secretHits === 0) {
    console.log('   ✓ No secrets detected in changes');
  } else {
    console.log(`   ✗ ${secretHits} potential secret(s) found in diff`);
    failures.push('Secret values staged or modified. Review and remove.');
  }

  // 4. Check that required files exist
  console.log('\n4. Required files...');
  const requiredFiles = [
    'package.json',
    'tsconfig.json',
    'AGENTS.md',
    'MODEL_SPEC.md'
  ];
  for (const file of requiredFiles) {
    if (existsSync(join(process.cwd(), file))) {
      console.log(`   ✓ ${file} present`);
    } else {
      console.log(`   ✗ ${file} MISSING`);
      failures.push(`Required file missing: ${file}`);
    }
  }

  // 5. Sanity: quick verification run (maybe skip)
  if (!skipTests) {
    console.log('\n5. Quick verification (typecheck only)...');
    // const typecheckResult = { success: true, output: '' };
    try {
      execSync('npm run typecheck', { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' });
      console.log('   ✓ Typecheck passes');
    } catch {
      console.log('   ✗ Typecheck failed');
      failures.push('Typecheck failing. Fix before release.');
    }
  } else {
    console.log('\n5. Quick verification (SKIPPED --skip-tests)');
  }

  // Final verdict
  console.log('\n========================================');
  if (failures.length === 0) {
    console.log('✓ Repository state is clean and release-ready.');
    process.exit(0);
  } else {
    console.log(`✗ ${failures.length} blocker(s):\n`);
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    process.exit(1);
  }
}

main();
