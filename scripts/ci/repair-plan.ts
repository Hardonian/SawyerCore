#!/usr/bin/env node
/**
 * CI REPAIR PLANNER
 * Generates a deterministic repair plan from a classified CI failure.
 *
 * Input: JSON classification from classify-failure.ts
 * Output: artifacts/ci-repair-plan.json + artifacts/ci-repair-plan.md
 *
 * Strategy: Evidence-based, safest fix first. Never auto-edit.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface Classification {
  type: string;
  confidence: number;
  message: string;
  file?: string;
  line?: number;
  context: string[];
  rawLines: string[];
}

interface RepairPlan {
  failure: Classification;
  suspectedRootCause: string;
  impactedFiles: string[];
  safestFixStrategy: string[];
  verificationCommands: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  generatedAt: string;
}

function analyzeFailure(classification: Classification): Omit<RepairPlan, 'failure' | 'generatedAt'> {
  const type = classification.type;
  let rootCause = '';
  let impactedFiles: string[] = [];
  let fixStrategy: string[] = [];
  let verificationCommands: string[] = [];
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium';

  switch (type) {
    case 'type-error': {
      rootCause = 'TypeScript type mismatch or missing type definition';
      impactedFiles = classification.file ? [classification.file] : extractFileFromContext(classification.context);
      fixStrategy = [
        'Review the type error message and locate the exact file/line',
        'Check for missing type imports or incorrect type assertions',
        'Add explicit types or adjust implementation to match interface',
        'If third-party types missing, install @types package or declare module'
      ];
      verificationCommands = [
        'npm run typecheck',
        'npm run build'
      ];
      riskLevel = 'low';
      break;
    }

    case 'lint-error': {
      rootCause = 'ESLint rule violation';
      impactedFiles = extractFileFromContext(classification.context);
      fixStrategy = [
        'Run: npx eslint --fix on the affected file(s)',
        'If auto-fix fails, manually correct formatting/logic',
        'Review ESLint config if violation seems unexpected'
      ];
      verificationCommands = [
        'npm run lint',
        'git diff --name-only  # review changes'
      ];
      riskLevel = 'low';
      break;
    }

    case 'test-failure': {
      rootCause = 'Vitest assertion or expectation mismatch';
      impactedFiles = classification.file ? [classification.file] : extractTestFileFromContext(classification.context);
      fixStrategy = [
        'Run the failing test in isolation: npm test -- <test-name>',
        'Examine the test expectation vs actual output',
        'Decide: fix code behavior OR update test expectation if behavior change is intentional',
        'If flaky test, add proper async handling or mocking'
      ];
      verificationCommands = [
        'npm test',
        'npm run verify:recommendations  # if related to recommendation tests'
      ];
      riskLevel = 'medium';
      break;
    }

    case 'build-failure': {
      rootCause = 'Compilation failed (Rust or TypeScript)';
      impactedFiles = extractFileFromContext(classification.context, /error\[.*\].+\.rs|error TS/);
      fixStrategy = [
        'If Rust: cargo check --message-format=json for precise location',
        'If TypeScript: tsc --noEmit for detailed errors',
        'Check for syntax errors, missing imports, or incompatible types',
        'Ensure all dependencies are installed: npm ci / cargo fetch'
      ];
      verificationCommands = [
        'cargo build --workspace',
        'npm run build',
        'npm run typecheck'
      ];
      riskLevel = 'high';  // Build failures block everything
      break;
    }

    case 'env-failure': {
      rootCause = 'Missing or misconfigured environment variable or toolchain';
      impactedFiles = ['.env.example', '.env.local', 'scripts/check-env.ts'];
      fixStrategy = [
        'Review missing variable: run npm run sawyer:doctor or npm run sawyer:check-env',
        'Copy .env.example to .env.local and fill required values',
        'Ensure correct Node.js version (>=20) and Rust toolchain stable',
        'Check PATH includes required binaries'
      ];
      verificationCommands = [
        'npm run sawyer:check-env',
        'node -v && rustc --version',
        'npm ci && cargo fetch'
      ];
      riskLevel = 'critical';  // Blocks entire environment
      break;
    }

    case 'dependency-failure': {
      rootCause = 'Dependency resolution or security issue';
      impactedFiles = ['package.json', 'Cargo.toml', 'package-lock.json', 'Cargo.lock'];
      fixStrategy = [
        'Clear npm cache: npm cache clean --force',
        'Delete lock files and regenerate: rm package-lock.json && npm ci',
        'For Cargo: cargo update -p <dep> or cargo clean && cargo build',
        'Check for deprecated or conflicting dependencies'
      ];
      verificationCommands = [
        'npm ci',
        'cargo fetch',
        'npm audit  # optionally --audit-level moderate'
      ];
      riskLevel = 'high';
      break;
    }

    default:
      rootCause = 'Unknown failure pattern';
      impactedFiles = [];
      fixStrategy = [
        'Manually review CI log to identify error pattern',
        'Search codebase for similar past failures',
        'Consider running locally with same command to reproduce'
      ];
      verificationCommands = [
        'Re-run failing CI step locally'
      ];
      riskLevel = 'high';
  }

  return {
    suspectedRootCause: rootCause,
    impactedFiles: [...new Set(impactedFiles)],
    safestFixStrategy: fixStrategy,
    verificationCommands,
    riskLevel
  };
}

function extractFileFromContext(context: string[], _pattern: RegExp = /.*\.(ts|tsx|rs|md|json)/): string[] {
  const files: string[] = [];
  for (const line of context) {
    const match = line.match(/(\/[\w\/\-]+\.(?:ts|tsx|rs|md|json))/);
    if (match) files.push(match[1]);
  }
  return files;
}

function extractTestFileFromContext(context: string[]): string[] {
  const files: string[] = [];
  for (const line of context) {
    const match = line.match(/(tests\/[\w\/\-]+\.ts)/);
    if (match) files.push(match[1]);
    // Also look for file references in stack traces
    const fileMatch = line.match(/at .*?(\/[\w\/\-]+\.ts)/);
    if (fileMatch) files.push(fileMatch[1]);
  }
  return [...new Set(files)];
}

function ensureArtifactsDir(): string {
  const artifactsDir = join(process.cwd(), 'artifacts', 'ci-repair');
  mkdirSync(artifactsDir, { recursive: true });
  return artifactsDir;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: tsx scripts/ci/repair-plan.ts <classification-json-file>');
    console.error('   or: cat classification.json | tsx scripts/ci/repair-plan.ts');
    process.exit(1);
  }

  let input: string;
  if (args[0] === '-') {
    // stdin
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    input = Buffer.concat(chunks).toString('utf-8');
  } else {
    input = readFileSync(args[0], 'utf-8');
  }

  const classification: Classification = JSON.parse(input);
  const repairPlan: RepairPlan = {
    failure: classification,
    generatedAt: new Date().toISOString(),
    ...analyzeFailure(classification)
  };

  const artifactsDir = ensureArtifactsDir();
  const jsonPath = join(artifactsDir, 'ci-repair-plan.json');
  const mdPath = join(artifactsDir, 'ci-repair-plan.md');

  // Write JSON
  writeFileSync(jsonPath, JSON.stringify(repairPlan, null, 2));
  console.log(`✓ Repair plan JSON written to ${jsonPath}`);

  // Write Markdown
  const mdContent = generateMarkdown(repairPlan);
  writeFileSync(mdPath, mdContent);
  console.log(`✓ Repair plan Markdown written to ${mdPath}`);

  // Also print summary to stdout
  console.log('\n=== REPAIR PLAN SUMMARY ===');
  console.log(`Type:             ${repairPlan.failure.type}`);
  console.log(`Confidence:       ${(repairPlan.failure.confidence * 100).toFixed(0)}%`);
  console.log(`Risk Level:       ${repairPlan.riskLevel}`);
  console.log(`Root Cause:       ${repairPlan.suspectedRootCause}`);
  console.log(`Impacted Files:   ${repairPlan.impactedFiles.length > 0 ? repairPlan.impactedFiles.join(', ') : '(none detected)'}`);
  console.log(`\nRecommended Actions:`);
  repairPlan.safestFixStrategy.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log(`\nVerification:`);
  repairPlan.verificationCommands.forEach(c => console.log(`  $ ${c}`));
}

function generateMarkdown(plan: RepairPlan): string {
  const typeEmoji = {
    'type-error': '🔤',
    'lint-error': '🧹',
    'test-failure': '🧪',
    'build-failure': '🔨',
    'env-failure': '⚙️',
    'dependency-failure': '📦',
    'unknown': '❓'
  };

  return `# CI Repair Plan

> Generated: ${plan.generatedAt}
> Failure Type: ${typeEmoji[plan.failure.type as keyof typeof typeEmoji] || '❓'} ${plan.failure.type}
> Confidence: ${(plan.failure.confidence * 100).toFixed(0)}%
> Risk Level: ${plan.riskLevel.toUpperCase()}

## Root Cause

${plan.suspectedRootCause}

## Impacted Files

${plan.impactedFiles.length > 0 ? plan.impactedFiles.map(f => `- \`${f}\``).join('\n') : 'No specific files detected from log context.'}

## Context

${plan.failure.context.map(line => `> ${line}`).join('\n')}

## Safest Fix Strategy

${plan.safestFixStrategy.map(s => `1. ${s}`).join('\n')}

## Verification Commands

\`\`\`bash
${plan.verificationCommands.map(c => c).join('\n')}
\`\`\`

## Raw Log Snippet

\`\`\`
${plan.failure.rawLines.slice(0, 15).join('\n')}
\`\`\`

---
*This plan is deterministic. Execute verification commands in order. Do not proceed if verification fails.*
`;
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
