import { describe, expect, it } from 'vitest';
import { CompressionEngine, estimateTokens } from '../../src/runtime/compression/index.js';
import { RecursivePromptSystem } from '../../src/runtime/prompts/index.js';
import { SemanticCache, computeSemanticHash } from '../../src/runtime/cache/index.js';
describe('CompressionEngine', () => {
    it('compresses repeated context by 50-80% while retaining required terms', () => {
        const engine = new CompressionEngine({ maxContextBlocks: 4, maxFactLength: 120 });
        const repeated = 'SawyerCore must preserve truthful degraded states in CLI and HTTP responses. '.repeat(16);
        const result = engine.compressPrompt({
            instruction: 'Route the task for an edge device.',
            requiredTerms: ['truthful degraded states', 'edge device'],
            contextBlocks: [
                { id: 'a', text: repeated, weight: 10 },
                { id: 'b', text: repeated, weight: 5 },
                { id: 'c', text: 'Low battery should prefer q4 local models and avoid large GPU work.', weight: 8 }
            ]
        });
        expect(result.qualityGate.status).toBe('passed');
        expect(result.reductionPercent).toBeGreaterThanOrEqual(50);
        expect(result.reductionPercent).toBeLessThanOrEqual(80);
        expect(result.compressedTokenEstimate).toBeLessThan(result.originalTokenEstimate);
    });
    it('selects low-power q4 candidates only when available and constrained', () => {
        const engine = new CompressionEngine();
        const candidates = [
            { id: 'large-fp16', quantization: 'fp16', contextLimit: 8192, estimatedRamGb: 16, capabilities: ['chat'], available: true, latencyRank: 3 },
            { id: 'edge-q4', quantization: 'q4', contextLimit: 4096, estimatedRamGb: 4, capabilities: ['chat'], available: true, latencyRank: 1 },
            { id: 'missing-q8', quantization: 'q8', contextLimit: 4096, estimatedRamGb: 6, capabilities: ['chat'], available: false, latencyRank: 2 }
        ];
        const selected = engine.selectModel(candidates, {
            availableRamGb: 6,
            requiredCapability: 'chat',
            maxContextTokens: 2048,
            preferLowPower: true
        });
        expect(selected.status).toBe('selected');
        expect(selected.modelId).toBe('edge-q4');
        expect(selected.quantization).toBe('q4');
    });
    it('reports degraded model selection instead of silently falling back', () => {
        const engine = new CompressionEngine();
        const selected = engine.selectModel([], {
            availableRamGb: 2,
            requiredCapability: 'chat',
            maxContextTokens: 2048,
            preferLowPower: true
        });
        expect(selected.status).toBe('degraded');
        expect(selected.modelId).toBeNull();
        expect(selected.reason).toContain('no available model');
    });
    it('converts doctrine docs into deterministic rule graphs', () => {
        const engine = new CompressionEngine();
        const graph = engine.docsToRuleGraph(`
      If private_data then force_local
      CLI responses must preserve truthful degraded states
    `);
        expect(graph.nodes).toHaveLength(2);
        expect(graph.edges).toHaveLength(1);
        expect(graph.nodes[0].condition).toBe("private_data=='true'");
        expect(graph.nodes[0].action).toBe('force_local');
    });
    it('converts workflows into executable variable templates', () => {
        const engine = new CompressionEngine();
        const template = engine.workflowToTemplate('verify', `
      cargo fmt --all
      cargo test -p {{crate}}
    `);
        expect(template.variables).toEqual(['crate']);
        expect(template.steps[1].command).toBe('cargo test -p {{crate}}');
    });
});
describe('RecursivePromptSystem', () => {
    it('builds recursive prompts with stable dependency ordering and variable reuse', () => {
        const system = new RecursivePromptSystem();
        const fragments = [
            { id: 'root', template: 'Task: {{task}}\nUse: {{policy}}', dependsOn: ['policy'] },
            { id: 'policy', template: 'Policy: {{policy}}', variables: [{ name: 'policy', value: 'local-first deterministic routing' }] }
        ];
        const result = system.build({
            rootFragmentId: 'root',
            fragments,
            variables: [{ name: 'task', value: 'compress context' }]
        });
        expect(result.fragmentOrder).toEqual(['policy', 'root']);
        expect(result.prompt).toContain('local-first deterministic routing');
        expect(result.unresolvedVariables).toEqual([]);
        expect(result.tokenEstimate).toBe(estimateTokens(result.prompt));
    });
    it('trims prompt fragments to an explicit token budget', () => {
        const system = new RecursivePromptSystem();
        const result = system.build({
            rootFragmentId: 'root',
            tokenBudget: 10,
            fragments: [
                { id: 'root', template: 'Keep this short.', dependsOn: ['context'] },
                { id: 'context', template: 'Long context '.repeat(40) }
            ]
        });
        expect(result.tokenEstimate).toBeLessThanOrEqual(10);
        expect(result.warnings).toContain('prompt trimmed to token budget');
    });
});
describe('SemanticCache', () => {
    it('caches outputs by deterministic semantic hash', () => {
        const cache = new SemanticCache();
        const prompt = 'Summarize local first edge runtime behavior.';
        const entry = cache.set(prompt, 'summary', { nowMs: 100 });
        const hit = cache.get(prompt, { nowMs: 101 });
        expect(hit.hit).toBe(true);
        expect(hit.value).toBe('summary');
        expect(entry.semanticHash).toBe(computeSemanticHash(prompt));
    });
    it('supports deterministic approximate semantic hits', () => {
        const cache = new SemanticCache();
        cache.set('Summarize edge runtime cache behavior', 'cached-summary', { nowMs: 100 });
        const hit = cache.get('please summarize runtime edge cache behavior', {
            nowMs: 101,
            similarityThreshold: 0.75
        });
        expect(hit.hit).toBe(true);
        expect(hit.reason).toContain('approximate_semantic_match');
    });
    it('expires entries explicitly', () => {
        const cache = new SemanticCache();
        cache.set('old prompt', 'old', { ttlMs: 10, nowMs: 100 });
        const miss = cache.get('old prompt', { nowMs: 111 });
        expect(miss.hit).toBe(false);
        expect(miss.reason).toBe('expired');
    });
});
