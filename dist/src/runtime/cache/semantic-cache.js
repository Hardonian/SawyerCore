import { createHash } from 'node:crypto';
import { estimateTokens } from '../compression/compression-engine.js';
export class SemanticCache {
    entries = new Map();
    get(prompt, options = {}) {
        const nowMs = options.nowMs ?? Date.now();
        const semanticHash = computeSemanticHash(prompt);
        const exact = this.entries.get(semanticHash);
        if (exact && !isExpired(exact, nowMs)) {
            return {
                hit: true,
                semanticHash,
                value: exact.value,
                reason: 'exact_semantic_hash_match',
                matchedHash: semanticHash
            };
        }
        const threshold = options.similarityThreshold ?? 1;
        if (threshold < 1) {
            const promptTokens = semanticTokens(prompt);
            for (const entry of [...this.entries.values()].sort((a, b) => a.semanticHash.localeCompare(b.semanticHash))) {
                if (isExpired(entry, nowMs))
                    continue;
                const similarity = jaccard(promptTokens, semanticTokens(entry.prompt));
                if (similarity >= threshold) {
                    return {
                        hit: true,
                        semanticHash,
                        value: entry.value,
                        reason: `approximate_semantic_match:${similarity.toFixed(4)}`,
                        matchedHash: entry.semanticHash
                    };
                }
            }
        }
        return {
            hit: false,
            semanticHash,
            value: null,
            reason: exact ? 'expired' : 'miss',
            matchedHash: null
        };
    }
    set(prompt, value, options = {}) {
        const nowMs = options.nowMs ?? Date.now();
        const semanticHash = computeSemanticHash(prompt);
        const entry = {
            semanticHash,
            prompt,
            value,
            tokenEstimate: estimateTokens(prompt),
            createdAtMs: nowMs,
            expiresAtMs: options.ttlMs ? nowMs + options.ttlMs : null
        };
        this.entries.set(semanticHash, entry);
        return entry;
    }
    precompute(items, options = {}) {
        for (const item of items) {
            this.set(item.prompt, item.value, options);
        }
        return items.length;
    }
    pruneExpired(nowMs = Date.now()) {
        let removed = 0;
        for (const [hash, entry] of this.entries.entries()) {
            if (isExpired(entry, nowMs)) {
                this.entries.delete(hash);
                removed += 1;
            }
        }
        return removed;
    }
    size() {
        return this.entries.size;
    }
    keys() {
        return [...this.entries.keys()].sort();
    }
}
export function computeSemanticHash(input) {
    const canonical = semanticTokens(input).join(' ');
    return createHash('sha256').update(canonical).digest('hex');
}
export function semanticTokens(input) {
    const tokens = input
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' URL ')
        .replace(/\b\d+(?:\.\d+)?\b/g, ' NUMBER ')
        .match(/[a-z0-9_]+/g) ?? [];
    return [...new Set(tokens.filter((token) => token.length > 2).map(normalizeToken))].sort();
}
function normalizeToken(token) {
    if (token === 'summary' || token === 'summarize' || token === 'summarization')
        return 'summar';
    if (token.endsWith('ing') && token.length > 5)
        return token.slice(0, -3);
    if (token.endsWith('ed') && token.length > 4)
        return token.slice(0, -2);
    if (token.endsWith('s') && token.length > 4)
        return token.slice(0, -1);
    return token;
}
function isExpired(entry, nowMs) {
    return entry.expiresAtMs !== null && entry.expiresAtMs <= nowMs;
}
function jaccard(a, b) {
    const setA = new Set(a);
    const setB = new Set(b);
    const union = new Set([...setA, ...setB]);
    if (union.size === 0)
        return 1;
    let intersection = 0;
    for (const token of setA) {
        if (setB.has(token))
            intersection += 1;
    }
    return intersection / union.size;
}
