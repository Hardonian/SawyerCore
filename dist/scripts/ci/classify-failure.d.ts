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
interface Classification {
    type: 'type-error' | 'lint-error' | 'test-failure' | 'build-failure' | 'env-failure' | 'dependency-failure' | 'unknown';
    confidence: number;
    message: string;
    file?: string;
    line?: number;
    context: string[];
    rawLines: string[];
}
export declare function classify(logLines: string[]): Classification;
export {};
