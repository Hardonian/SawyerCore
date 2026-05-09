import { createHash } from 'node:crypto';
import { estimateTokens } from '../compression/compression-engine.js';

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

export class SemanticCache<T> {
  private readonly entries = new Map<string, SemanticCacheEntry<T>>();

  get(prompt: string, options: SemanticCacheGetOptions = {}): SemanticCacheResult<T> {
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
        if (isExpired(entry, nowMs)) continue;
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

  set(prompt: string, value: T, options: SemanticCacheSetOptions = {}): SemanticCacheEntry<T> {
    const nowMs = options.nowMs ?? Date.now();
    const semanticHash = computeSemanticHash(prompt);
    const entry: SemanticCacheEntry<T> = {
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

  precompute(items: Array<{ prompt: string; value: T }>, options: SemanticCacheSetOptions = {}): number {
    for (const item of items) {
      this.set(item.prompt, item.value, options);
    }
    return items.length;
  }

  pruneExpired(nowMs = Date.now()): number {
    let removed = 0;
    for (const [hash, entry] of this.entries.entries()) {
      if (isExpired(entry, nowMs)) {
        this.entries.delete(hash);
        removed += 1;
      }
    }
    return removed;
  }

  size(): number {
    return this.entries.size;
  }

  keys(): string[] {
    return [...this.entries.keys()].sort();
  }
}

export function computeSemanticHash(input: string): string {
  const canonical = semanticTokens(input).join(' ');
  return createHash('sha256').update(canonical).digest('hex');
}

export function semanticTokens(input: string): string[] {
  const tokens = input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' URL ')
    .replace(/\b\d+(?:\.\d+)?\b/g, ' NUMBER ')
    .match(/[a-z0-9_]+/g) ?? [];
  return [...new Set(tokens.filter((token) => token.length > 2).map(normalizeToken))].sort();
}

function normalizeToken(token: string): string {
  if (token === 'summary' || token === 'summarize' || token === 'summarization') return 'summar';
  if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
  if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
  if (token.endsWith('s') && token.length > 4) return token.slice(0, -1);
  return token;
}

function isExpired<T>(entry: SemanticCacheEntry<T>, nowMs: number): boolean {
  return entry.expiresAtMs !== null && entry.expiresAtMs <= nowMs;
}

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  return intersection / union.size;
}
