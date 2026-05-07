#!/usr/bin/env node
/**
 * CI REPAIR VERIFIER
 * Verifies that the proposed repair plan resolves the failure.
 *
 * Input: artifacts/ci-repair-plan.json (reads automatically)
 * Or: accepts explicit command arguments
 *
 * Executes verification commands and reports success/failure.
 * Returns exit code 0 if all pass, 1 otherwise.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DEFAULT_PLAN_PATH = join(process.cwd(), 'artifacts', 'ci-repair', 'ci-repair-plan.json');

interface VerificationResult {
  command: string;
  success: boolean;
  exitCode: number;
  output: string;
  error?: string;
}

function runCommand(cmd: string, timeout: number = 120000): VerificationResult {
  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout,
      cwd: process.cwd()
    });
    return {
      command: cmd,
      success: true,
      exitCode: 0,
      output: output.slice(0, 2000)  // truncate
    };
  } catch (err: any) {
    return {
      command: cmd,
      success: false,
      exitCode: err.status || 1,
      output: err.stdout?.slice(0, 1000) || '',
      error: err.stderr?.slice(0, 1000) || err.message
    };
  }
}

function verifyFromPlan(planPath: string): void {
  if (!existsSync(planPath)) {
    console.error(`✗ Repair plan not found: ${planPath}`);
    console.error('  Run repair-plan.ts first to generate a plan.');
    process.exit(1);
  }

  const planContent = readFileSync(planPath, 'utf-8');
  const plan = JSON.parse(planContent);

  console.log('🔍 CI Repair Verification');
  console.log('=======================');
  console.log(`Plan:      ${plan.suspectedRootCause}`);
  console.log(`Type:      ${plan.failure.type}`);
  console.log(`Risk:      ${plan.riskLevel}`);
  console.log(`Commands:  ${plan.verificationCommands.length}\n`);

  let allPassed = true;
  const results: VerificationResult[] = [];

  for (const cmd of plan.verificationCommands) {
    console.log(`▶ Running: ${cmd}`);
    const result = runCommand(cmd);
    results.push(result);

    if (result.success) {
      console.log(`  ✓ PASS (exit ${result.exitCode})`);
      if (result.output.trim()) {
        console.log(`  Output: ${result.output.trim()}`);
      }
    } else {
      console.log(`  ✗ FAIL (exit ${result.exitCode})`);
      console.log(`  Error: ${result.error || 'Unknown error'}`);
      if (result.output.trim()) {
        console.log(`  Output: ${result.output.trim()}`);
      }
      allPassed = false;
    }
    console.log('');
  }

  console.log('=======================');
  if (allPassed) {
    console.log('✓ All verification commands passed.');
    console.log('Repair appears successful. Consider committing your changes.');
    process.exit(0);
  } else {
    console.log('✗ One or more verification commands failed.');
    console.log('Repair not complete or further investigation needed.');
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  const planPath = args[0] || DEFAULT_PLAN_PATH;
  verifyFromPlan(planPath);
}

main();
