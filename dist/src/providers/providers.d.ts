import type { AiTask, InferenceResult, Capability } from '../types/contracts.js';
import type { RuntimeProvider, ProviderCapabilities, ProviderTarget, ProviderHealth } from './provider.js';
import type { SawyerConfig } from '../types/config.js';
interface ProviderOpts {
    name: string;
    target: ProviderTarget;
    enabled?: boolean;
    healthy?: boolean;
    capabilities: Capability[];
    maxContextTokens?: number;
    supportsPrivateData?: boolean;
    baseCostPer1kTokens: number;
    baseLatencyMs: number;
}
export type OpenAiCompatibleProviderOpts = ProviderOpts & {
    endpoint?: string;
    timeoutMs: number;
    retries: number;
    model?: string;
    modelAliases?: Record<string, string>;
    apiKey?: string;
};
declare class StubProvider implements RuntimeProvider {
    readonly name: string;
    readonly target: ProviderTarget;
    protected healthy: boolean;
    protected caps: ProviderCapabilities;
    protected baseCostPer1kTokens: number;
    protected baseLatencyMs: number;
    constructor(opts: ProviderOpts);
    setHealth(healthy: boolean): void;
    healthCheck(): Promise<ProviderHealth>;
    estimateCost(task: AiTask): number;
    estimateLatency(task: AiTask): number;
    supportsTask(task: AiTask): boolean;
    runInference(task: AiTask): Promise<InferenceResult>;
    getCapabilities(): ProviderCapabilities;
}
declare class OpenAiCompatibleProvider extends StubProvider {
    private readonly fetchImpl;
    constructor(opts: OpenAiCompatibleProviderOpts, fetchImpl?: typeof fetch);
    private readonly endpoint;
    private readonly timeoutMs;
    private readonly retries;
    private readonly model;
    private readonly modelAliases;
    private readonly apiKey?;
    healthCheck(): Promise<ProviderHealth>;
    runInference(task: AiTask): Promise<InferenceResult>;
    private requestJson;
}
export declare class VllmProvider extends OpenAiCompatibleProvider {
    constructor(opts: Omit<OpenAiCompatibleProviderOpts, keyof ProviderOpts> & Partial<ProviderOpts>, fetchImpl?: typeof fetch);
}
export declare class LiteLLMProvider extends OpenAiCompatibleProvider {
    constructor(opts: Omit<OpenAiCompatibleProviderOpts, keyof ProviderOpts> & Partial<ProviderOpts>, fetchImpl?: typeof fetch);
}
export declare class LlamaCppProvider extends StubProvider {
    private readonly opts;
    constructor(opts: {
        endpoint: string;
        timeoutMs: number;
        retries: number;
        model: string;
        fetchImpl?: typeof fetch;
    });
    private get fetchImpl();
    healthCheck(): Promise<{
        healthy: boolean;
        reason?: string;
    }>;
    runInference(task: AiTask): Promise<InferenceResult>;
}
export declare class MobileNpuProvider extends StubProvider {
    constructor();
}
export declare class CloudFallbackProvider extends StubProvider {
    private readonly apiKey;
    constructor(apiKey: string | undefined);
    healthCheck(): Promise<{
        healthy: boolean;
        reason?: string;
    }>;
}
export declare class MockProvider extends StubProvider {
    constructor(name?: string);
    runInference(task: AiTask): Promise<InferenceResult>;
}
export declare function createProvidersFromConfig(config: SawyerConfig): RuntimeProvider[];
export {};
