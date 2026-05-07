import { describe, it, expect } from 'vitest';
import { classify } from '../../scripts/ci/classify-failure.js';
describe('CI Failure Classifier', () => {
    it('classifies TypeScript type errors', () => {
        const log = `
error TS2322: Type 'string' is not assignable to type 'number'.
error TS2304: Cannot find name 'foobar'.
    `.split('\n').filter(Boolean);
        const result = classify(log);
        expect(result.type).toBe('type-error');
        expect(result.confidence).toBeGreaterThan(0.8);
    });
    it('classifies ESLint violations', () => {
        const log = `
/path/to/file.ts
  45:5  error  Unexpected any  @typescript-eslint/no-explicit-any
  78:1  warning  console.log detected  no-console
✖ 2 problems (1 error, 1 warning)
    `.split('\n').filter(Boolean);
        const result = classify(log);
        expect(result.type).toBe('lint-error');
    });
    it('classifies Vitest test failures', () => {
        const log = `
FAIL tests/runtime/router.test.ts (12 ms)
  ● should route to cloud fallback when local providers unhealthy
    Expected: "LOCAL_GPU"
    Received: "cloud"
      123 | expect(out.decision).toBe('LOCAL_GPU');
    `.split('\n').filter(Boolean);
        const result = classify(log);
        expect(result.type).toBe('test-failure');
    });
    it('classifies build failures', () => {
        const log = `
error: could not compile sawyer-core due to previous error
error[E0308]: mismatched types
    `.split('\n').filter(Boolean);
        const result = classify(log);
        expect(result.type).toBe('build-failure');
    });
    it('classifies environment/toolchain failures', () => {
        const log = `
bash: cargo: command not found
error: found a bug in the compiler!  # or requires node >=20
    `.split('\n').filter(Boolean);
        const result = classify(log);
        expect(result.type).toBe('env-failure');
    });
    it('classifies dependency failures', () => {
        const log = `
npm ERR! code ENOENT
npm ERR! syscall lstat
npm ERR! path ./node_modules/some-dep
npm ERR! checksum mismatch
    `.split('\n').filter(Boolean);
        const result = classify(log);
        expect(result.type).toBe('dependency-failure');
    });
    it('falls back to unknown for unclassified patterns', () => {
        const log = ['Some random output that does not match any pattern'];
        const result = classify(log);
        expect(result.type).toBe('unknown');
    });
});
