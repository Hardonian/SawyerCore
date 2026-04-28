import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { safeDefaultConfig } from '../../src/runtime/defaults.js';
import { loadSawyerConfig } from '../../src/runtime/config-loader.js';

describe('config defaults', () => {
  it('keeps cloud fallback disabled in local-safe', () => {
    const config = safeDefaultConfig();
    expect(config.profile).toBe('local-safe');
    expect(config.toggles.enable_cloud_fallback).toBe(false);
  });

  it('uses safe defaults when config is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sawyer-'));
    const out = loadSawyerConfig(join(dir, 'missing.json'));
    expect(out.usingDefaults).toBe(true);
    expect(out.errors).toHaveLength(0);
  });

  it('returns structured error on malformed config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sawyer-'));
    const path = join(dir, 'sawyer.config.json');
    writeFileSync(path, '{oops', 'utf8');
    const out = loadSawyerConfig(path);
    expect(out.errors.join(' ')).toContain('malformed config JSON');
  });

  it('denies private-mode cloud conflict', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sawyer-'));
    const path = join(dir, 'sawyer.config.json');
    const config = safeDefaultConfig();
    config.toggles.enable_cloud_fallback = true;
    writeFileSync(path, JSON.stringify(config), 'utf8');
    const out = loadSawyerConfig(path);
    expect(out.errors.join(' ')).toContain('private mode');
  });
});
