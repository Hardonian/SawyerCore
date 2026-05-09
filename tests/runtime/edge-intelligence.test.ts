import { describe, expect, it } from 'vitest';
import { KbVarStore, chooseQuantization, planExecution } from '../../src/runtime/edge-intelligence.js';

describe('KbVarStore', () => {
  it('keeps deterministic overwrite rules', () => {
    const store = new KbVarStore();

    expect(
      store.upsert({ key: 'device.mode', value: 'tiny', scope: 'device', freshness: 10, confidence: 0.8 }).accepted
    ).toBe(true);

    const stale = store.upsert({ key: 'device.mode', value: 'local', scope: 'device', freshness: 9, confidence: 0.7 });
    expect(stale.accepted).toBe(false);
    expect(store.get('device.mode')?.value).toBe('tiny');

    const higherConfidence = store.upsert({
      key: 'device.mode',
      value: 'local',
      scope: 'device',
      freshness: 9,
      confidence: 0.95
    });
    expect(higherConfidence.accepted).toBe(true);
    expect(store.get('device.mode')?.value).toBe('local');
  });

  it('supports deterministic fuzzy lookup without embeddings', () => {
    const store = new KbVarStore();
    store.upsert({ key: 'session.recent_summary', value: 'cached', scope: 'session', freshness: 1, confidence: 0.5 });

    const hit = store.lookup('recent summary');
    expect(hit.strategy).toBe('fuzzy');
    expect(hit.match?.key).toBe('session.recent_summary');
  });
});

describe('planExecution', () => {
  it('prioritizes KB and templates before recursive or full model', () => {
    const store = new KbVarStore();
    store.upsert({ key: 'task.greeting', value: 'hello', scope: 'session', freshness: 1, confidence: 0.9 });

    const kbPlan = planExecution({
      requestKey: 'task.greeting',
      prompt: 'say hello',
      kbStore: store,
      maxRecursionDepth: 3,
      maxRecursiveTokens: 128,
      memoryBudgetMb: 1024,
      allowFullModel: true,
      qualityMode: 'default'
    });
    expect(kbPlan.strategy).toBe('kb-variables');

    const templatePlan = planExecution({
      requestKey: 'health-check/runtime',
      prompt: 'health',
      kbStore: new KbVarStore(),
      maxRecursionDepth: 3,
      maxRecursiveTokens: 128,
      memoryBudgetMb: 1024,
      allowFullModel: true,
      qualityMode: 'default'
    });
    expect(templatePlan.strategy).toBe('rules-templates');
  });

  it('uses recursive path first and returns explicit degraded reject when full model is disabled', () => {
    const recursivePlan = planExecution({
      requestKey: 'task.longer',
      prompt: 'small prompt for recursive processing',
      kbStore: new KbVarStore(),
      maxRecursionDepth: 3,
      maxRecursiveTokens: 128,
      memoryBudgetMb: 2048,
      allowFullModel: false,
      qualityMode: 'default'
    });
    expect(recursivePlan.strategy).toBe('recursive-lm');

    const rejectPlan = planExecution({
      requestKey: 'task.big',
      prompt: 'word '.repeat(600),
      kbStore: new KbVarStore(),
      maxRecursionDepth: 3,
      maxRecursiveTokens: 128,
      memoryBudgetMb: 2048,
      allowFullModel: false,
      qualityMode: 'default'
    });
    expect(rejectPlan.strategy).toBe('reject');
    expect(rejectPlan.degraded).toBe(true);
  });

  it('keeps quantization priority deterministic', () => {
    expect(chooseQuantization(2048, 'default')).toBe('Q4_K_M');
    expect(chooseQuantization(7000, 'high')).toBe('Q5_K_M');
    expect(chooseQuantization(14000, 'high')).toBe('Q8_0');
  });
});
