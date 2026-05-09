export interface FailurePattern {
    patternId: string;
    frequency: number;
    commonErrorTokens: string[];
    affectedPaths: string[];
    lastSeen: string;
    regressionDetected: boolean;
}
