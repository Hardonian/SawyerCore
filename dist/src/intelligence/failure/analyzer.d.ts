import { FailurePattern } from './patterns.js';
export declare class FailureAnalyzer {
    private readonly traceFile;
    private readonly outputDir;
    constructor(traceFile?: string, outputDir?: string);
    analyze(): FailurePattern[];
    private writeArtifacts;
}
