import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TraceRecorder } from '../../src/runtime/trace/trace-recorder.js';
import { FailureAnalyzer } from '../../src/intelligence/failure/analyzer.js';
import { PolicyRuleEngine } from '../../src/intelligence/policy/rule-engine.js';
import { AutoOptimizer } from '../../src/intelligence/optimizer/optimizer.js';
import { ExplainabilityLayer } from '../../src/runtime/explain/explain.js';
import { KnowledgeCompiler } from '../../src/intelligence/knowledge/compiler.js';

const TEST_DIR = path.join(process.cwd(), 'data', 'traces_test');
const ARTIFACT_DIR = path.join(process.cwd(), 'artifacts', 'intelligence_test');
const POLICY_DIR = path.join(process.cwd(), 'data', 'policies_test');

describe('Intelligence System', () => {
  beforeEach(() => {
    [TEST_DIR, ARTIFACT_DIR, POLICY_DIR].forEach(dir => {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
    });
  });

  afterEach(() => {
    [TEST_DIR, ARTIFACT_DIR, POLICY_DIR].forEach(dir => {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    });
  });

  it('records a trace securely', () => {
    const recorder = new TraceRecorder(TEST_DIR);
    recorder.recordTrace({
      traceId: 't-123',
      timestamp: new Date().toISOString(),
      inputHash: 'abc',
      executionPath: ['router', 'openai'],
      decisions: [],
      cost: { timeMs: 150 },
      outcome: 'success',
      fallbackUsage: false,
      error: 'Secret key sk-12345678901234567890 leaked'
    });

    const lines = fs.readFileSync(path.join(TEST_DIR, 'execution-traces.jsonl'), 'utf-8').trim().split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).not.toContain('sk-12345678901234567890');
    expect(lines[0]).toContain('[REDACTED]');
  });

  it('analyzes failures and produces patterns', () => {
    const traceFile = path.join(TEST_DIR, 'execution-traces.jsonl');
    const recorder = new TraceRecorder(TEST_DIR);
    recorder.recordTrace({
      traceId: 't-1', timestamp: new Date().toISOString(), inputHash: '1',
      executionPath: ['p1'], decisions: [], cost: { timeMs: 100 },
      outcome: 'failure', fallbackUsage: true, error: 'Connection timeout'
    });
    recorder.recordTrace({
      traceId: 't-2', timestamp: new Date().toISOString(), inputHash: '2',
      executionPath: ['p1'], decisions: [], cost: { timeMs: 100 },
      outcome: 'failure', fallbackUsage: true, error: 'Connection timeout'
    });

    const analyzer = new FailureAnalyzer(traceFile, ARTIFACT_DIR);
    const patterns = analyzer.analyze();
    
    expect(patterns.length).toBe(1);
    expect(patterns[0].frequency).toBe(2);
  });

  it('proposes optimizations based on traces', () => {
    const traceFile = path.join(TEST_DIR, 'execution-traces.jsonl');
    const recorder = new TraceRecorder(TEST_DIR);
    // high latency
    recorder.recordTrace({
      traceId: 't-1', timestamp: new Date().toISOString(), inputHash: '1',
      executionPath: [], decisions: [], cost: { timeMs: 3000 },
      outcome: 'success', fallbackUsage: false
    });

    const optimizer = new AutoOptimizer(traceFile, ARTIFACT_DIR);
    const proposals = optimizer.optimize();
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals[0].target).toBe('provider');
  });

  it('rule engine deterministically evaluates conditions', () => {
    const engine = new PolicyRuleEngine(path.join(POLICY_DIR, 'rules.json'));
    const actions = engine.evaluate({ memory: 100 * 1024 * 1024 }); // low memory
    expect(actions).toContain('force small model');
  });

  it('compiles knowledge into deterministic structures', () => {
    const compiler = new KnowledgeCompiler();
    const graph = compiler.compile(
      [{ patternId: 'P1', frequency: 1, commonErrorTokens: [], affectedPaths: [], lastSeen: '', regressionDetected: false }],
      [{ id: 'R1', condition: 'cond', action: 'act', version: 1 }]
    );
    expect(graph.nodes.length).toBe(3); // 1 pattern, 1 rule, 1 shortcut
    expect(graph.getShortcuts().length).toBe(1);
  });

  it('provides explainability', () => {
    const explainer = new ExplainabilityLayer();
    const explanations = explainer.explainRun([
      { id: 'd1', context: 'ctx', chosenOption: 'opt', alternatives: ['alt1'], reason: 'rsn' }
    ], true, false);
    
    expect(explanations.length).toBe(2);
    expect(explanations[0]).toContain("Chosen: 'opt'");
    expect(explanations[1]).toContain('Fallback triggered');
  });
});
