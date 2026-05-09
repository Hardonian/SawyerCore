import { describe, it, expect } from 'vitest';
import { computeRunId, computeInputHash, computeOutputHash, computeConfigHash } from '../../src/runtime/core/run-identity.js';
import { ExecutionLog } from '../../src/runtime/core/execution-log.js';
import { DeterministicEngine } from '../../src/runtime/core/deterministic-engine.js';
import { MockProvider } from '../../src/providers/providers.js';
import { AuditLogger, InMemoryAuditSink } from '../../src/observability/audit.js';
import { safeDefaultConfig } from '../../src/runtime/defaults.js';
import type { AiTask } from '../../src/types/contracts.js';
import type { RoutingSignals } from '../../src/runtime/optimization-engine.js';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const baseTask: AiTask = {
  id: 'det-1',
  type: 'chat',
  input: 'deterministic input test',
  inputClassification: 'public',
  requiredCapability: 'chat',
  latencyPreferenceMs: 200,
  privacyRequirement: 'cloud-allowed',
  maxBudgetUsd: 0.2,
  fallbackAllowed: true,
  maxContextTokens: 1000
};

const defaultSignals: RoutingSignals = {
  batteryPercent: 80,
  thermalState: 'nominal',
  hardwareAvailable: { LOCAL_GPU: true },
  failureHistory: {}
};

describe('verify:determinism', () => {
  it('identical inputs produce identical run IDs', () => {
    const inputs = {
      taskId: 'task-1',
      taskType: 'chat',
      input: 'hello world',
      configHash: 'abc123',
      providerNames: ['vllm', 'litellm']
    };

    const a = computeRunId(inputs);
    const b = computeRunId(inputs);

    expect(a.runId).toBe(b.runId);
    expect(a.inputHash).toBe(b.inputHash);
    expect(a.runId).toHaveLength(64);
  });

  it('different inputs produce different run IDs', () => {
    const a = computeRunId({
      taskId: 'task-1',
      taskType: 'chat',
      input: 'hello',
      configHash: 'abc',
      providerNames: ['vllm']
    });
    const b = computeRunId({
      taskId: 'task-1',
      taskType: 'chat',
      input: 'world',
      configHash: 'abc',
      providerNames: ['vllm']
    });

    expect(a.runId).not.toBe(b.runId);
    expect(a.inputHash).not.toBe(b.inputHash);
  });

  it('provider order does not affect run ID', () => {
    const inputs1 = {
      taskId: 'task-1',
      taskType: 'chat',
      input: 'test',
      configHash: 'abc',
      providerNames: ['vllm', 'litellm']
    };
    const inputs2 = {
      taskId: 'task-1',
      taskType: 'chat',
      input: 'test',
      configHash: 'abc',
      providerNames: ['litellm', 'vllm']
    };

    expect(computeRunId(inputs1).runId).toBe(computeRunId(inputs2).runId);
  });

  it('input hash is consistent', () => {
    const hash1 = computeInputHash('consistent input');
    const hash2 = computeInputHash('consistent input');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('output hash is consistent', () => {
    const hash1 = computeOutputHash('consistent output');
    const hash2 = computeOutputHash('consistent output');
    expect(hash1).toBe(hash2);
  });

  it('config hash is consistent', () => {
    const config = safeDefaultConfig();
    const hash1 = computeConfigHash(config);
    const hash2 = computeConfigHash(config);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('DeterministicEngine produces same runId for same inputs', async () => {
    const config = safeDefaultConfig();
    const provider = new MockProvider('mock');
    const logDir = join(tmpdir(), `sawyer-det-test-${Date.now()}`);
    mkdirSync(logDir, { recursive: true });

    const engine1 = new DeterministicEngine(
      [provider],
      config,
      new AuditLogger(new InMemoryAuditSink()),
      {
        logFilePath: join(logDir, 'log1.jsonl'),
        clock: () => '2026-01-01T00:00:00.000Z'
      }
    );

    const engine2 = new DeterministicEngine(
      [provider],
      config,
      new AuditLogger(new InMemoryAuditSink()),
      {
        logFilePath: join(logDir, 'log2.jsonl'),
        clock: () => '2026-01-01T00:00:00.000Z'
      }
    );

    const receipt1 = await engine1.execute(baseTask, 'default', defaultSignals);
    const receipt2 = await engine2.execute(baseTask, 'default', defaultSignals);

    expect(receipt1.runId).toBe(receipt2.runId);
    expect(receipt1.inputHash).toBe(receipt2.inputHash);

    rmSync(logDir, { recursive: true, force: true });
  });

  it('execution log records and replays entries', () => {
    const logDir = join(tmpdir(), `sawyer-log-test-${Date.now()}`);
    mkdirSync(logDir, { recursive: true });
    const logPath = join(logDir, 'test.jsonl');

    const log = new ExecutionLog({ filePath: logPath });
    log.append({
      runId: 'run-1',
      inputHash: 'in-hash',
      outputHash: 'out-hash',
      provider: 'mock',
      model: 'mock-model',
      taskType: 'chat',
      degradedState: 'NOMINAL',
      latencyMs: 10,
      costUsd: 0,
      success: true,
      errorMessage: null,
      timestampIso: '2026-01-01T00:00:00.000Z'
    });

    const replayed = log.replay();
    expect(replayed).toHaveLength(1);
    expect(replayed[0].runId).toBe('run-1');
    expect(replayed[0].inputHash).toBe('in-hash');

    rmSync(logDir, { recursive: true, force: true });
  });

  it('verifyOutputIntegrity detects tampering', async () => {
    const config = safeDefaultConfig();
    const provider = new MockProvider('mock');
    const logDir = join(tmpdir(), `sawyer-integrity-test-${Date.now()}`);
    mkdirSync(logDir, { recursive: true });

    const engine = new DeterministicEngine(
      [provider],
      config,
      new AuditLogger(new InMemoryAuditSink()),
      {
        logFilePath: join(logDir, 'integrity.jsonl'),
        clock: () => '2026-01-01T00:00:00.000Z'
      }
    );

    const receipt = await engine.execute(baseTask, 'default', defaultSignals);

    if (receipt.result) {
      expect(engine.verifyOutputIntegrity(receipt.runId, receipt.result.output)).toBe(true);
      expect(engine.verifyOutputIntegrity(receipt.runId, 'tampered output')).toBe(false);
    }

    rmSync(logDir, { recursive: true, force: true });
  });
});
