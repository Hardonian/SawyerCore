export interface OptimizationProposal {
    target: 'provider' | 'prompt' | 'caching';
    reason: string;
    estimatedSavings: string;
    actionable: boolean;
}
export declare class AutoOptimizer {
    private readonly traceFile;
    private readonly outputDir;
    constructor(traceFile?: string, outputDir?: string);
    optimize(): OptimizationProposal[];
}
