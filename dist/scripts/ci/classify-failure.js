#!/usr/bin/env node
/**
 * CI FAILURE CLASSIFIER
 * Parses failed logs into deterministic failure classifications.
 *
 * Input: stdin (CI log) or file path argument
 * Output: JSON classification to stdout
 *
 * Failure Types:
 * - type error: TypeScript compilation errors
 * - lint error: ESLint violations
 * - test failure: Vitest assertion failures
 * - build failure: Rust or TS build errors
 * - env/toolchain failure: Missing dependencies, version mismatches
 * - dependency/security failure: npm/cargo issues, vulnerabilities
 */
import { readFileSync } from 'fs';
export function classify(logLines) {
    const text = logLines.join('\n').toLowerCase();
    // ... (rest of the function)
    // Type errors: tsc errors, type 'X' is not assignable, etc.
    if (text.includes('error ts') || text.includes('type \'') || text.includes('is not assignable to type') || text.includes('cannot find name')) {
        return {
            type: 'type-error',
            confidence: 0.9,
            message: 'TypeScript type checking failed',
            context: extractContext(logLines, /error TS|type .* is not assignable|cannot find name/),
            rawLines: logLines.slice(0, 20)
        };
    }
    // Lint errors: eslint warnings/errors
    if (text.includes('eslint') || text.includes('✖') || text.includes('warning:') || text.match(/error\s+.*\s+.*\.ts/)) {
        return {
            type: 'lint-error',
            confidence: 0.85,
            message: 'ESLint linting violations detected',
            context: extractContext(logLines, /eslint|✖|warning:|error\s+/),
            rawLines: logLines.slice(0, 20)
        };
    }
    // Test failures: FAIL, expect(...).toBe, assertion error
    if (text.includes('FAIL') || text.includes('assertion failed') || text.includes('expected:') || text.includes('actual:') || text.match(/● .*\(.*\)/)) {
        return {
            type: 'test-failure',
            confidence: 0.9,
            message: 'Test suite assertions failed',
            file: extractTestFile(logLines),
            context: extractContext(logLines, /FAIL|assertion failed|● |expected:/),
            rawLines: logLines.slice(0, 30)
        };
    }
    // Build failures: cargo build failed, tsc build failed
    if (text.includes('error: could not compile') || text.includes('build failed') || text.includes('exit code 101')) {
        return {
            type: 'build-failure',
            confidence: 0.85,
            message: 'Build step failed (Rust or TypeScript)',
            context: extractContext(logLines, /error: could not compile|build failed|error\[/),
            rawLines: logLines.slice(0, 25)
        };
    }
    // Env/toolchain: command not found, version mismatch, missing tool
    if (text.includes('command not found') || text.includes('not found') || text.includes('version mismatch') || text.includes('requires node') || text.includes('requires rustc')) {
        return {
            type: 'env-failure',
            confidence: 0.9,
            message: 'Environment or toolchain issue detected',
            context: extractContext(logLines, /command not found|not found|version mismatch|requires/),
            rawLines: logLines.slice(0, 15)
        };
    }
    // Dependency/security: npm ERR, cargo failed, vuln, checksum mismatch
    if (text.includes('npm err') || text.includes('cargo failed') || text.includes('vulnerability') || text.includes('checksum mismatch') || text.includes('eacces') || text.includes('ENOENT')) {
        return {
            type: 'dependency-failure',
            confidence: 0.85,
            message: 'Dependency or security issue detected',
            context: extractContext(logLines, /npm err|cargo failed|vulnerability|checksum mismatch|eacces/),
            rawLines: logLines.slice(0, 20)
        };
    }
    return {
        type: 'unknown',
        confidence: 0.5,
        message: 'Could not classify failure automatically',
        context: logLines.slice(0, 15),
        rawLines: logLines.slice(0, 20)
    };
}
function extractContext(lines, pattern, maxLines = 10) {
    return lines.filter(line => pattern.test(line.toLowerCase())).slice(0, maxLines);
}
function extractTestFile(lines) {
    const match = lines.join('\n').match(/● (.*)\(.*\)/);
    return match ? match[1] : undefined;
}
// Main
async function main() {
    const args = process.argv.slice(2);
    let logLines;
    if (args.length > 0) {
        // Read from file
        const content = readFileSync(args[0], 'utf-8');
        logLines = content.split('\n');
    }
    else {
        // Read from stdin
        const chunks = [];
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
        }
        logLines = Buffer.concat(chunks).toString('utf-8').split('\n');
    }
    const classification = classify(logLines);
    console.log(JSON.stringify(classification, null, 2));
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
