import { ExecutionTrace } from './types.js';
export declare class TraceRecorder {
    private readonly traceDir;
    private readonly traceFile;
    constructor(traceDir?: string);
    private ensureDir;
    recordTrace(trace: ExecutionTrace): void;
    private redactSensitiveData;
    static hashInput(input: string): string;
}
