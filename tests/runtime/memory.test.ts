import { describe, it, expect } from 'vitest';
import { KnowledgePackRegistry, computePackChecksum, queryFacts, queryRules, type KnowledgePack } from '../../src/runtime/memory/knowledge-pack.js';
import { RuleGraph, type RuleGraphData } from '../../src/runtime/memory/rule-graph.js';
import { PromptMemory } from '../../src/runtime/memory/prompt-memory.js';

function testPack(): KnowledgePack {
  const pack: Omit<KnowledgePack, 'checksum'> = {
    id: 'test-pack',
    version: '1.0.0',
    description: 'Test knowledge pack',
    facts: [
      { key: 'llm-context', value: 'Local models prefer 4096 context', tags: ['model', 'context'], confidence: 0.9 },
      { key: 'privacy', value: 'Sensitive data must stay local', tags: ['privacy', 'policy'], confidence: 1.0 },
      { key: 'cost', value: 'Cloud inference costs $0.01/1k tokens', tags: ['cost', 'cloud'], confidence: 0.85 }
    ],
    rules: [
      { id: 'r1', condition: 'classification==private', action: 'force_local', priority: 100 },
      { id: 'r2', condition: 'ram_gb<8', action: 'use_tiny_model', priority: 90 },
      { id: 'r3', condition: 'battery<20', action: 'throttle_inference', priority: 80 }
    ]
  };
  return { ...pack, checksum: computePackChecksum(pack) };
}

describe('KnowledgePack', () => {
  it('checksum is deterministic', () => {
    const pack = testPack();
    const recomputed = computePackChecksum(pack);
    expect(pack.checksum).toBe(recomputed);
  });

  it('queryFacts filters by tags', () => {
    const pack = testPack();
    const results = queryFacts(pack, ['privacy']);
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('privacy');
  });

  it('queryFacts returns all when no tags', () => {
    const pack = testPack();
    const results = queryFacts(pack, []);
    expect(results).toHaveLength(3);
  });

  it('queryFacts sorts by confidence descending', () => {
    const pack = testPack();
    const results = queryFacts(pack, ['model', 'cost']);
    expect(results[0].confidence).toBeGreaterThanOrEqual(results[results.length - 1].confidence);
  });

  it('queryRules filters by condition substring', () => {
    const pack = testPack();
    const results = queryRules(pack, 'battery');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('r3');
  });

  it('registry queries across packs', () => {
    const registry = new KnowledgePackRegistry();
    registry.register(testPack());

    const secondPack: KnowledgePack = {
      id: 'second-pack',
      version: '1.0.0',
      description: 'Second pack',
      facts: [{ key: 'extra', value: 'Extra fact', tags: ['model'], confidence: 0.95 }],
      rules: [],
      checksum: ''
    };
    secondPack.checksum = computePackChecksum(secondPack);
    registry.register(secondPack);

    const results = registry.queryAcrossPacks(['model']);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].confidence).toBeGreaterThanOrEqual(results[1].confidence);
  });
});

describe('RuleGraph', () => {
  const graphData: RuleGraphData = {
    nodes: [
      { id: 'check-ram', condition: "ram=='low'", action: 'set_tiny_model', weight: 10 },
      { id: 'check-privacy', condition: "classification=='private'", action: 'force_local', weight: 20 },
      { id: 'apply-throttle', condition: "cpu_load=='high'", action: 'throttle', weight: 5 },
      { id: 'final-route', condition: "routed=='true'", action: 'execute', weight: 1 }
    ],
    edges: [
      { from: 'check-ram', to: 'apply-throttle', label: 'resource chain' },
      { from: 'check-privacy', to: 'final-route', label: 'privacy chain' },
      { from: 'apply-throttle', to: 'final-route', label: 'merge' }
    ]
  };

  it('topological order is deterministic', () => {
    const graph = new RuleGraph(graphData);
    const order1 = graph.topologicalOrder();
    const order2 = graph.topologicalOrder();
    expect(order1).toEqual(order2);
  });

  it('roots are nodes with no parents', () => {
    const graph = new RuleGraph(graphData);
    const roots = graph.roots();
    expect(roots).toContain('check-ram');
    expect(roots).toContain('check-privacy');
    expect(roots).not.toContain('final-route');
  });

  it('evaluates conditions against context', () => {
    const graph = new RuleGraph(graphData);
    const triggered = graph.evaluate({ ram: 'low', classification: 'private' });
    expect(triggered.length).toBe(2);
    expect(triggered[0].weight).toBeGreaterThanOrEqual(triggered[1].weight);
  });

  it('returns empty when no conditions match', () => {
    const graph = new RuleGraph(graphData);
    const triggered = graph.evaluate({ ram: 'high', classification: 'public' });
    expect(triggered).toHaveLength(0);
  });

  it('reports correct node and edge counts', () => {
    const graph = new RuleGraph(graphData);
    expect(graph.nodeCount()).toBe(4);
    expect(graph.edgeCount()).toBe(3);
  });
});

describe('PromptMemory', () => {
  it('resolves simple variables', () => {
    const mem = new PromptMemory([
      { name: 'model', value: 'llama-3' },
      { name: 'task', value: 'chat' }
    ]);

    const result = mem.resolve('Using {{model}} for {{task}}');
    expect(result).toBe('Using llama-3 for chat');
  });

  it('resolves recursive variables', () => {
    const mem = new PromptMemory([
      { name: 'greeting', value: 'Hello {{name}}' },
      { name: 'name', value: 'Sawyer' }
    ]);

    const result = mem.resolve('{{greeting}}!');
    expect(result).toBe('Hello Sawyer!');
  });

  it('detects cycles without crashing', () => {
    const mem = new PromptMemory([
      { name: 'a', value: '{{b}}' },
      { name: 'b', value: '{{a}}' }
    ]);

    const result = mem.resolve('Start: {{a}}');
    expect(result).toContain('CYCLE');
  });

  it('preserves unknown variables', () => {
    const mem = new PromptMemory();
    const result = mem.resolve('Value is {{unknown}}');
    expect(result).toBe('Value is {{unknown}}');
  });

  it('snapshot is immutable', () => {
    const mem = new PromptMemory([{ name: 'x', value: '1' }]);
    const snap = mem.snapshot();
    mem.set('x', '2');
    expect(snap.get('x')).toBe('1');
    expect(mem.get('x')).toBe('2');
  });

  it('toArray is sorted deterministically', () => {
    const mem = new PromptMemory([
      { name: 'zebra', value: 'z' },
      { name: 'alpha', value: 'a' },
      { name: 'middle', value: 'm' }
    ]);

    const arr = mem.toArray();
    expect(arr[0].name).toBe('alpha');
    expect(arr[1].name).toBe('middle');
    expect(arr[2].name).toBe('zebra');
  });
});
