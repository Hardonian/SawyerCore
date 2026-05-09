export interface SemanticCacheEntry<T> {
    semanticHash: string;
    prompt: string;
    value: T;
    tokenEstimate: number;
    createdAtMs: number;
    expiresAtMs: number | null;
}
export interface SemanticCacheGetOptions {
    similarityThreshold?: number;
    nowMs?: number;
}
export interface SemanticCacheSetOptions {
    ttlMs?: number;
    nowMs?: number;
}
export interface SemanticCacheResult<T> {
    hit: boolean;
    semanticHash: string;
    value: T | null;
    reason: string;
    matchedHash: string | null;
}
export declare class SemanticCache<T> {
    private readonly entries;
    get(prompt: string, options?: SemanticCacheGetOptions): SemanticCacheResult<T>;
    set(prompt: string, value: T, options?: SemanticCacheSetOptions): SemanticCacheEntry<T>;
    precompute(items: Array<{
        prompt: string;
        value: T;
    }>, options?: SemanticCacheSetOptions): number;
    pruneExpired(nowMs?: number): number;
    size(): number;
    keys(): string[];
}
export declare function computeSemanticHash(input: string): string;
export declare function semanticTokens(input: string): string[];
