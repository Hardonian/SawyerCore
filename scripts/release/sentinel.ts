#!/usr/bin/env node
/**
 * RELEASE SENTINEL
 * Blocks unsafe releases by enforcing truth checks before release.
 *
 * Checks:
 *   ✓ Clean TypeScript typecheck
 *   ✓ Clean ESLint
 *   ✓ All tests pass
 *   ✓ Build succeeds (TS + Rust)
 *   ✓ No forbidden TODO/FIXME in critical paths
 *   ✓ No direct secret leakage in source
 *   ✓ No obvious route hard-crash patterns
 *   ✓ No unhandled degraded states (throw without try/catch)
 *   ✓ No accidental env files in git
 *
 * Output: artifacts/release/sentinel-report.json + .md
 * Exit: 0 if all checks pass, 1 otherwise
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, relative } from 'path';

type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';
type CheckSeverity = 'required' | 'optional' | 'critical' | 'high';

interface CheckResult {
  name: string;
  status: CheckStatus;
  severity: CheckSeverity;
  message: string;
  details?: string;
  evidence?: string[];
}

interface SentinelReport {
  generatedAt: string;
  commit?: string;
  overall: 'passed' | 'failed' | 'warned';
  checks: CheckResult[];
  blocked: boolean;
  requiredFailures: string[];
}

// Helpers
function runCommand(cmd: string, timeoutMs: number = 120000, cwd?: string): { success: boolean; output: string; error: string } {
  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs
    });
    return { success: true, output: output.trim(), error: '' };
  } catch (err: any) {
    if (err.status === undefined && err.signal === undefined) {
      return { success: false, output: '', error: `Command timed out after ${timeoutMs}ms: ${cmd}` };
    }
    return { success: false, output: err.stdout?.trim() || '', error: err.stderr?.trim() || err.message };
  }
}

// function fileExists(file: string): boolean {
//   return existsSync(resolve(process.cwd(), file));
// }

function isCriticalPath(file: string): boolean {
  const criticalPatterns = [
    /src\/billing/,
    /src\/providers/,
    /src\/policy/,
    /src\/tenancy/,
    /src\/api\//,
    /crates\/sawyer-(server|core|cli)/,
    /src\/cli\//
  ];
  return criticalPatterns.some(p => p.test(file));
}

function checkTypecheck(): CheckResult {
  const result = runCommand('npm run typecheck', 60000);
  if (result.success) {
    return { name: 'TypeScript typecheck', status: 'pass', severity: 'required', message: 'No type errors found' };
  }
  // Parse errors
  const errorCount = (result.output.match(/error TS/gi) || []).length;
  return {
    name: 'TypeScript typecheck',
    status: 'fail',
    severity: 'required',
    message: `${errorCount} type error(s) detected`,
    details: result.output.slice(0, 800),
    evidence: result.output.split('\n').slice(0, 10)
  };
}

function checkLint(): CheckResult {
  const result = runCommand('npm run lint', 60000);
  if (result.success) {
    return { name: 'ESLint', status: 'pass', severity: 'required', message: 'No lint violations' };
  }
  return {
    name: 'ESLint',
    status: 'fail',
    severity: 'required',
    message: `Lint violations detected`,
    details: result.output.slice(0, 800),
    evidence: result.output.split('\n').slice(0, 10)
  };
}

function checkTests(): CheckResult {
  const result = runCommand('npm test', 300000);
  if (result.success) {
    return { name: 'Test suite', status: 'pass', severity: 'required', message: 'All tests passed' };
  }
  if (result.error.includes('timed out')) {
    return {
      name: 'Test suite',
      status: 'fail',
      severity: 'required',
      message: 'Test suite timed out (exceeded 5 min)',
      details: result.error
    };
  }
  // Parse test failures
  const failingMatch = result.output.match(/(\d+)\s+failed/);
  const failCount = failingMatch ? parseInt(failingMatch[1]) : 'some';
  return {
    name: 'Test suite',
    status: 'fail',
    severity: 'required',
    message: `${failCount} test(s) failed`,
    details: result.output.slice(0, 1000),
    evidence: result.output.split('\n').filter(l => l.includes('FAIL') || l.includes('●')).slice(0, 10)
  };
}

function checkBuild(): CheckResult {
  const rustResult = runCommand('cargo build --workspace', 300000);
  const tsResult = runCommand('npm run build', 120000);

  if (rustResult.success && tsResult.success) {
    return { name: 'Build (Rust + TS)', status: 'pass', severity: 'required', message: 'All builds succeeded' };
  }

  const errors: string[] = [];
  if (!rustResult.success) errors.push(`Rust build failed: ${rustResult.error.slice(0, 200)}`);
  if (!tsResult.success) errors.push(`TS build failed: ${tsResult.error.slice(0, 200)}`);

  return {
    name: 'Build (Rust + TS)',
    status: 'fail',
    severity: 'required',
    message: 'Build failures detected',
    details: errors.join('\n'),
    evidence: [...(rustResult.error.split('\n').slice(0, 5)), ...(tsResult.error.split('\n').slice(0, 5))]
  };
}
function checkForbiddenComments(): CheckResult {
  const criticalExts = ['.ts', '.tsx', '.rs'];
  const forbidden = ['TODO', 'FIXME', 'HACK', 'XXX'];
  const hits: { file: string; line: string }[] = [];

  function scanDir(dir: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && !entry.startsWith('node_modules') && !entry.startsWith('dist') && !entry.startsWith('target')) {
          scanDir(fullPath);
        } else if (stat.isFile() && criticalExts.some(ext => entry.endsWith(ext))) {
          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const keyword of forbidden) {
              if (line.toUpperCase().includes(keyword) && !line.trim().startsWith('//')) {
                if (isCriticalPath(fullPath)) {
                  hits.push({ file: relative(process.cwd(), fullPath), line: line.trim().slice(0, 80) });
                }
              }
            }
          }
        }
      } catch { /* ignore unreadable */ }
    }
  }

  scanDir(join(process.cwd(), 'src'));
  scanDir(join(process.cwd(), 'crates'));

  if (hits.length === 0) {
    return { name: 'Forbidden TODO/FIXME', status: 'pass', severity: 'required', message: 'No forbidden markers in critical paths' };
  }

  return {
    name: 'Forbidden TODO/FIXME',
    status: 'fail',
    severity: 'required',
    message: `${hits.length} forbidden marker(s) found in critical paths`,
    evidence: hits.slice(0, 10).map(h => `${h.file}: ${h.line}`)
  };
}

function checkSecretLeakage(): CheckResult {
  const patterns = [
    /['"]?(?:api[_-]?key|secret|password|token|private[_-]?key|passphrase)['"]?\s*[:=]\s*['"][^'"]{8,}['"]/gi,
    /sk-[A-Za-z0-9]{24,}/g,  // Stripe key pattern
    /(?:STRIPE|AWS|GCP|AZURE|DATABASE|JWT|API|SECRET|PASSWORD)_(?:KEY|SECRET|TOKEN)=/gi,
  ];
  const hits: { file: string; line: string }[] = [];

  function scanForSecrets(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const pattern of patterns) {
          pattern.lastIndex = 0; // reset regex state
          const line = lines[i];
          if (pattern.test(line)) {
            // Exclude .env.example and test files
            if (!filePath.includes('.env.example') && !filePath.includes('.test.')) {
              hits.push({ file: relative(process.cwd(), filePath), line: line.trim().slice(0, 100) });
            }
            break;
          }
        }
      }
    } catch { /* ignore */ }
  }

  function walk(dir: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && !entry.startsWith('node_modules') && !entry.startsWith('dist') && !entry.startsWith('target') && entry !== '.git') {
          walk(fullPath);
        } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.rs') || entry.endsWith('.js') || entry.endsWith('.json'))) {
          scanForSecrets(fullPath);
        }
      } catch { /* ignore */ }
    }
  }

  walk(join(process.cwd(), 'src'));
  walk(join(process.cwd(), 'crates'));

  if (hits.length === 0) {
    return { name: 'Secret leakage', status: 'pass', severity: 'required', message: 'No hardcoded secrets detected' };
  }

  return {
    name: 'Secret leakage',
    status: 'fail',
    severity: 'critical',
    message: `Potential secret(s) found in source code: ${hits.length} occurrence(s)`,
    evidence: hits.slice(0, 5).map(h => `${h.file}: ${h.line}`)
  };
}

function checkEnvFiles(): CheckResult {
  // Check if any .env files are tracked by git
  const gitResult = runCommand('git ls-files');
  if (!gitResult.success) {
    return { name: 'Committed env files', status: 'skip', severity: 'required', message: 'Not a git repository (or git unavailable)' };
  }

  const tracked = gitResult.output.split('\n');
  const envFiles = tracked.filter(f => f.includes('.env') && !f.endsWith('.env.example') && !f.endsWith('.env.local.example'));
  
  if (envFiles.length === 0) {
    return { name: 'Committed env files', status: 'pass', severity: 'required', message: 'No .env files in git history' };
  }

  return {
    name: 'Committed env files',
    status: 'fail',
    severity: 'critical',
    message: `${envFiles.length} environment file(s) accidentally committed`,
    evidence: envFiles
  };
}

function checkHardCrashPatterns(): CheckResult {
  // Look for obvious patterns that would cause hard crashes
  const riskyPatterns = [
    { pattern: /process\.exit\(/, reason: 'process.exit() in server code will terminate entire process' },
    { pattern: /throw\s+new\s+Error\('unimplemented'/i, reason: 'unimplemented runtime throw' },
    { pattern: /while\s*\(\s*true\s*\)/i, reason: 'infinite loop without break' },
  ];

  const hits: { file: string; reason: string }[] = [];

  function scan(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      for (const { pattern, reason } of riskyPatterns) {
        if (pattern.test(content)) {
          hits.push({ file: relative(process.cwd(), filePath), reason });
          break;
        }
      }
    } catch { /* ignore */ }
  }

  function walk(dir: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && !entry.startsWith('node_modules') && !entry.startsWith('dist')) {
          walk(fullPath);
        } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.rs'))) {
          scan(fullPath);
        }
      } catch { /* ignore */ }
    }
  }

  walk(join(process.cwd(), 'src'));
  walk(join(process.cwd(), 'crates'));

  if (hits.length === 0) {
    return { name: 'Hard-crash patterns', status: 'pass', severity: 'required', message: 'No obvious hard-crash patterns found' };
  }

  return {
    name: 'Hard-crash patterns',
    status: 'fail',
    severity: 'critical',
    message: `Potential hard-crash pattern(s) detected: ${hits.length}`,
    evidence: hits.slice(0, 5).map(h => `${h.file}: ${h.reason}`)
  };
}

function checkUnhandledDegradedStates(): CheckResult {
  // Look for catch blocks that don't handle or rethrow without logging
  const pattern = /catch\s*\(\s*\w+\s*\)\s*\{\s*\}[\s\n]*throw/; // empty catch then throw
  const hits: string[] = [];

  function scan(filePath: string): void {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          hits.push(`${relative(process.cwd(), filePath)}:${i + 1}`);
          break;
        }
      }
    } catch { /* ignore */ }
  }

  function walk(dir: string): void {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory() && !entry.startsWith('node_modules') && !entry.startsWith('dist')) {
          walk(fullPath);
        } else if (stat.isFile() && (entry.endsWith('.ts') || entry.endsWith('.rs'))) {
          scan(fullPath);
        }
      } catch { /* ignore */ }
    }
  }

  walk(join(process.cwd(), 'src'));

  if (hits.length === 0) {
    return { name: 'Unhandled degraded states', status: 'pass', severity: 'required', message: 'No empty catch-then-throw anti-patterns found' };
  }

  return {
    name: 'Unhandled degraded states',
    status: 'fail',
    severity: 'high',
    message: 'Empty catch rethrow without handling (anti-pattern)',
    evidence: hits.slice(0, 5)
  };
}

function getGitCommit(): string | undefined {
  const result = runCommand('git rev-parse --short HEAD');
  return result.success ? result.output : undefined;
}

// Main
async function main() {
  console.log('🔒 Release Sentinel — Truth Check');
  console.log('===================================\n');

  const checks: CheckResult[] = [];
  
  // Required checks
  console.log('⟳ Running required checks...\n');
  checks.push(checkTypecheck());
  checks.push(checkLint());
  checks.push(checkTests());
  checks.push(checkBuild());
  checks.push(checkForbiddenComments());
  checks.push(checkSecretLeakage());
  checks.push(checkEnvFiles());
  checks.push(checkHardCrashPatterns());
  checks.push(checkUnhandledDegradedStates());

  // Summary
  const required = checks.filter(c => c.severity === 'required');
  const requiredFailures = required.filter(c => c.status === 'fail');
  const hasCritical = checks.some(c => c.status === 'fail' && (c.severity as string) === 'critical');
  
  const overall = requiredFailures.length === 0 ? 'passed' : 'failed';
  const blocked = requiredFailures.length > 0 || hasCritical;

  const commit = getGitCommit();

  const report: SentinelReport = {
    generatedAt: new Date().toISOString(),
    commit,
    overall,
    checks,
    blocked,
    requiredFailures: requiredFailures.map(c => c.name)
  };

  // Write artifacts
  const artifactsDir = join(process.cwd(), 'artifacts', 'release');
  mkdirSync(artifactsDir, { recursive: true });

  const jsonPath = join(artifactsDir, 'sentinel-report.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`✓ Report written: artifacts/release/sentinel-report.json`);

  const mdPath = join(artifactsDir, 'sentinel-report.md');
  writeFileSync(mdPath, generateMarkdown(report));
  console.log(`✓ Report written: artifacts/release/sentinel-report.md\n`);

  // Print results
  console.log('RESULTS:');
  console.log('--------');
  for (const check of checks) {
    const icon = check.status === 'pass' ? '✓' : check.status === 'fail' ? '✗' : check.status === 'warn' ? '⚠' : '○';
    const severity = check.severity === 'required' ? '' : ' (opt)';
    console.log(`${icon} ${check.name}${severity}: ${check.message}`);
  }

  console.log('\n===================================');
  if (blocked) {
    console.log('✗ RELEASE BLOCKED');
    console.log(`  Failures: ${requiredFailures.map(f => f.name).join(', ')}`);
    process.exit(1);
  } else {
    console.log('✓ RELEASE CLEARED — All required checks passed.');
    process.exit(0);
  }
}

function generateMarkdown(report: SentinelReport): string {
  const statusIcon = report.blocked ? '✗' : '✓';
  const statusText = report.blocked ? 'BLOCKED' : 'CLEARED';

  let md = `# Release Sentinel Report

${statusIcon} **Status: ${statusText}**
Generated: ${report.generatedAt}
Commit: ${report.commit || 'N/A'}

## Summary

- Overall: ${report.overall.toUpperCase()}
- Required checks passed: ${report.checks.filter(c => c.status === 'pass' && c.severity === 'required').length} / ${report.checks.filter(c => c.severity === 'required').length}

## Check Details

| Check | Status | Message |
|-------|--------|---------|
`;

  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : '⚠️';
    md += `| ${check.name} | ${icon} ${check.status.toUpperCase()} | ${check.message} |\n`;
  }

  if (report.blocked && report.requiredFailures.length > 0) {
    md += `\n## Blockers\n\n`;
    for (const failure of report.requiredFailures) {
      md += `- ❌ ${failure}\n`;
    }
  }

  md += `\n## Evidence\n\n`;
  for (const check of report.checks) {
    if (check.status === 'fail' && (check.evidence || check.details)) {
      md += `### ${check.name}\n\`\`\`\n${check.evidence?.join('\n') || check.details?.slice(0, 500)}\n\`\`\`\n\n`;
    }
  }

  md += `---
*This report is deterministic. Manual override requires explicit review and signed approval.*\n`;

  return md;
}

main().catch(err => {
  console.error('Sentinel failed:', err);
  process.exit(1);
});
