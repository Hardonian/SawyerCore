/**
 * Structured knowledge packs — local-first intelligence without heavy RAG/vector DB.
 * Knowledge is stored as typed JSON with deterministic lookup.
 */
export interface KnowledgeFact {
    key: string;
    value: string;
    tags: string[];
    confidence: number;
}
export interface KnowledgeRule {
    id: string;
    condition: string;
    action: string;
    priority: number;
}
export interface KnowledgePack {
    id: string;
    version: string;
    description: string;
    facts: KnowledgeFact[];
    rules: KnowledgeRule[];
    checksum: string;
}
export declare function loadKnowledgePack(path: string): KnowledgePack | null;
export declare function computePackChecksum(pack: Omit<KnowledgePack, 'checksum'>): string;
export declare function queryFacts(pack: KnowledgePack, tags: string[]): KnowledgeFact[];
export declare function queryRules(pack: KnowledgePack, conditionSubstring: string): KnowledgeRule[];
export declare class KnowledgePackRegistry {
    private readonly packs;
    register(pack: KnowledgePack): void;
    get(id: string): KnowledgePack | undefined;
    queryAcrossPacks(tags: string[]): KnowledgeFact[];
    list(): string[];
}
