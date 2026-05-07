import { randomUUID } from 'node:crypto';
import { UnifiedExecutionGraph, type UnifiedExecutionReceipt } from '../system/execution-graph.js';
import { createProvidersFromConfig } from '../providers/providers.js';
import { loadSawyerConfig } from '../runtime/config-loader.js';
import { AuditLogger, InMemoryAuditSink } from '../observability/audit.js';
import { estimateTokens } from '../runtime/compression/compression-engine.js';
import type { RoutingSignals } from '../runtime/optimization-engine.js';
import type { AiTask, Capability, DataClassification, PrivacyRequirement, TaskType } from '../types/contracts.js';

let graphInstance: UnifiedExecutionGraph | null = null;

export async function getExecutionGraph(): Promise<UnifiedExecutionGraph> {
  if (!graphInstance) {
    const loadResult = loadSawyerConfig();
    const providers = createProvidersFromConfig(loadResult.config);
    graphInstance = new UnifiedExecutionGraph(
      providers,
      loadResult.config,
      new AuditLogger(new InMemoryAuditSink()),
      { defaultSignals: getDefaultSignals() }
    );
  }
  return graphInstance;
}

export async function runTask(
  tenantId: string,
  taskInput: {
    type: string;
    input: string;
    model?: string;
    parameters?: Record<string, unknown>;
    privacy?: 'public' | 'private' | 'sensitive';
  }
): Promise<{
  runId: string;
  output: unknown;
  provider: string;
  latencyMs: number;
  tokensUsed?: number;
  degradedState: string;
  reasons: string[];
  graph: UnifiedExecutionReceipt['graph'];
}> {
  const graph = await getExecutionGraph();
  const task = toAiTask(taskInput);
  const receipt = await graph.run({
    task,
    tenantId,
    signals: getDefaultSignals(),
    agentRun: task.type === 'agent-planning'
  });
  const output = receipt.result?.output ?? null;

  return {
    runId: receipt.runId,
    output,
    provider: receipt.result?.provider ?? receipt.decision,
    latencyMs: receipt.latencyMs,
    tokensUsed: output === null ? 0 : estimateTokens(String(output)),
    degradedState: receipt.degradedState,
    reasons: receipt.reasons,
    graph: receipt.graph
  };
}

export async function getAvailableProviders(): Promise<string[]> {
  const graph = await getExecutionGraph();
  return graph.getProviderNames();
}

export async function getEngineStatus(): Promise<{
  healthy: boolean;
  providers: string[];
  degradedState: string;
  cacheSize: number;
  historySize: number;
}> {
  const graph = await getExecutionGraph();
  const providers = graph.getProviderNames();

  return {
    healthy: providers.length > 0,
    providers,
    degradedState: providers.length > 0 ? 'NOMINAL' : 'MODEL_UNAVAILABLE',
    cacheSize: graph.getCacheSize(),
    historySize: graph.getHistory().length
  };
}

function toAiTask(input: {
  type: string;
  input: string;
  privacy?: 'public' | 'private' | 'sensitive';
}): AiTask {
  const type = normalizeTaskType(input.type);
  const classification = normalizeClassification(input.privacy);

  return {
    id: randomUUID(),
    type,
    input: input.input,
    inputClassification: classification,
    requiredCapability: capabilityFor(type),
    latencyPreferenceMs: 2000,
    privacyRequirement: privacyRequirementFor(classification),
    maxBudgetUsd: 0.02,
    fallbackAllowed: classification === 'public',
    maxContextTokens: 4096
  };
}

function normalizeTaskType(type: string): TaskType {
  if (type === 'completion') return 'chat';
  if (type === 'chat' || type === 'embedding' || type === 'classification' || type === 'summarization') return type;
  return 'chat';
}

function capabilityFor(type: TaskType): Capability {
  const map: Record<TaskType, Capability> = {
    chat: 'chat',
    summarization: 'summarization',
    'code-reasoning': 'code',
    embedding: 'embedding',
    classification: 'classification',
    'vision-placeholder': 'vision',
    'retrieval-reranking-placeholder': 'retrieval',
    'agent-planning': 'planning'
  };
  return map[type];
}

function normalizeClassification(privacy: 'public' | 'private' | 'sensitive' | undefined): DataClassification {
  if (privacy === 'private' || privacy === 'sensitive') return privacy;
  return 'public';
}

function privacyRequirementFor(classification: DataClassification): PrivacyRequirement {
  return classification === 'public' ? 'cloud-allowed' : 'local-only';
}

function getDefaultSignals(): RoutingSignals {
  return {
    batteryPercent: 100,
    thermalState: 'nominal',
    hardwareAvailable: {
      LOCAL_NPU: false,
      LOCAL_CPU: true,
      LOCAL_GPU: true,
      VLLM_SERVER: true,
      LITELLM_PROXY: true,
      CLOUD_FALLBACK: false
    },
    failureHistory: {}
  };
}
