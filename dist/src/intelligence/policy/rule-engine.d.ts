export interface IntelligenceRule {
    id: string;
    condition: string;
    action: string;
    version: number;
}
export declare class PolicyRuleEngine {
    private rulesFile;
    private rules;
    constructor(rulesFile?: string);
    private loadRules;
    private ensureDir;
    saveRules(): void;
    evaluate(context: Record<string, any>): string[];
    addRule(rule: IntelligenceRule): void;
}
