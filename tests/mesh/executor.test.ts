import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeshExecutor } from '../../src/mesh/executor.js';
import { globalRegistry } from '../../src/mesh/node-registry.js';
import { meshAudit } from '../../src/mesh/audit.js';
import type { AiTask } from '../../src/types/contracts.js';

describe('MeshExecutor', () => {
  let mockEngine: any;
  let mockRouter: any;
  let executor: MeshExecutor;

  const sampleTask: AiTask = {
    id: 't1',
    type: 'chat',
    input: 'hello',
    inputClassification: 'public',
    requiredCapability: 'chat',
    latencyPreferenceMs: 1000,
    privacyRequirement: 'cloud-allowed',
    maxBudgetUsd: 0.1,
    fallbackAllowed: true,
    maxContextTokens: 1000
  };

  beforeEach(() => {
    mockEngine = {
      execute: vi.fn()
    };
    mockRouter = {
      selectNode: vi.fn()
    };
    executor = new MeshExecutor(mockEngine as any, mockRouter as any, globalRegistry);
    globalRegistry.clear();
    meshAudit.clear();
  });

  it('executes locally when no target node is selected', async () => {
    mockRouter.selectNode.mockReturnValue(null);
    mockEngine.execute.mockResolvedValue({
      runId: 'r1',
      result: { output: 'local' },
      reasons: []
    });

    const result = await executor.execute(sampleTask, 't1', {} as any);
    expect(result.nodeId).toBe('local');
    expect(result.result.output).toBe('local');
    expect(mockEngine.execute).toHaveBeenCalled();
  });

  it('dispatches remotely when a peer node is selected', async () => {
    const peerId = 'peer-1';
    globalRegistry.register({
      id: peerId,
      address: 'http://peer1',
      capabilities: ['chat'],
      status: 'active',
      lastSeen: Date.now(),
      publicKey: 'pk1',
      metadata: {}
    });

    mockRouter.selectNode.mockReturnValue(globalRegistry.getNode(peerId));

    const result = await executor.execute(sampleTask, 't1', {} as any);
    expect(result.nodeId).toBe(peerId);
    expect(result.result.output).toContain('REMOTE_RESULT');
    expect(mockEngine.execute).not.toHaveBeenCalled();

    const history = meshAudit.getHistory(sampleTask.id);
    expect(history.some(e => e.action === 'dispatch' && e.targetNodeId === peerId)).toBe(true);
    expect(history.some(e => e.action === 'receive' && e.status === 'success')).toBe(true);
  });

  it('falls back to local when remote dispatch fails', async () => {
    const peerId = 'peer-1';
    globalRegistry.register({
      id: peerId,
      address: 'http://peer1',
      capabilities: ['chat'],
      status: 'active',
      lastSeen: Date.now(),
      publicKey: 'pk1',
      metadata: {}
    });

    mockRouter.selectNode.mockReturnValue(globalRegistry.getNode(peerId));
    
    // Update to stale to force failure in dispatchRemote
    globalRegistry.register({
      id: peerId,
      address: 'http://peer1',
      capabilities: ['chat'],
      status: 'stale',
      lastSeen: Date.now(),
      publicKey: 'pk1',
      metadata: {}
    });

    mockEngine.execute.mockResolvedValue({
      runId: 'r1',
      result: { output: 'fallback-local' },
      reasons: []
    });

    const result = await executor.execute(sampleTask, 't1', {} as any);
    expect(result.nodeId).toBe('local');
    expect(result.result.output).toBe('fallback-local');
    expect(mockEngine.execute).toHaveBeenCalled();

    const history = meshAudit.getHistory(sampleTask.id);
    expect(history.some(e => e.action === 'fallback' && e.status === 'failure')).toBe(true);
  });
});
