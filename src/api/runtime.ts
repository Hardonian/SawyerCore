import { DeterministicEngine } from '../runtime/core/deterministic-engine';
import { SawyerRouter } from '../runtime/router';
import { SafetyController } from '../runtime/safety/safety-controller';
import { createProvidersFromConfig } from '../providers/providers';
import { loadConfig } from '../runtime/config-loader';
import { AiTask, TaskType } from '../types/contracts';
import { randomUUID } from 'crypto';

let engineInstance: DeterministicEngine | null = null;

export async function getEngine(): Promise<DeterministicEngine> {
  if (!engineInstance) {
    const config = loadConfig();
    const providers = createProvidersFromConfig(config);
    const router = new SawyerRouter(providers);
    const safety = new SafetyController();
    engineInstance = new DeterministicEngine(router, safety);
  }
  return engineInstance;
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
}> {
  const engine = await getEngine();
  
  const task: AiTask = {
    id: randomUUID(),
    type: taskInput.type as TaskType,
    input: taskInput.input,
    privacy: taskInput.privacy ?? 'public',
    budget: 1.0,
    modelPreference: taskInput.model,
    parameters: taskInput.parameters ?? {}
  };

  const startTime = Date.now();
  const result = await engine.executeTask(task);
  const latencyMs = Date.now() - startTime;

  return {
    runId: result.runId ?? randomUUID(),
    output: result.output,
    provider: result.provider ?? 'unknown',
    latencyMs,
    tokensUsed: result.tokensUsed,
    degradedState: result.degradedState ?? 'NOMINAL'
  };
}

export async function getAvailableProviders(): Promise<string[]> {
  const engine = await getEngine();
  return engine.getProviderNames();
}

export async function getEngineStatus(): Promise<{
  healthy: boolean;
  providers: string[];
  degradedState: string;
}> {
  const engine = await getEngine();
  const providers = engine.getProviderNames();
  
  return {
    healthy: providers.length > 0,
    providers,
    degradedState: engine.getDegradedState()
  };
}
