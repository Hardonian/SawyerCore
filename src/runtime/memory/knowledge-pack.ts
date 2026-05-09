/**
 * Structured knowledge packs — local-first intelligence without heavy RAG/vector DB.
 * Knowledge is stored as typed JSON with deterministic lookup.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

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

export function loadKnowledgePack(path: string): KnowledgePack | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const pack = JSON.parse(raw) as KnowledgePack;
  const actualChecksum = computePackChecksum(pack);
  if (pack.checksum && pack.checksum !== actualChecksum) {
    return null;
  }
  return pack;
}

export function computePackChecksum(pack: Omit<KnowledgePack, 'checksum'>): string {
  const canonical = JSON.stringify({
    id: pack.id,
    version: pack.version,
    facts: pack.facts,
    rules: pack.rules
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function queryFacts(pack: KnowledgePack, tags: string[]): KnowledgeFact[] {
  if (tags.length === 0) return [...pack.facts];
  return pack.facts
    .filter((f) => tags.some((t) => f.tags.includes(t)))
    .sort((a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key));
}

export function queryRules(pack: KnowledgePack, conditionSubstring: string): KnowledgeRule[] {
  return pack.rules
    .filter((r) => r.condition.includes(conditionSubstring))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export class KnowledgePackRegistry {
  private readonly packs = new Map<string, KnowledgePack>();

  register(pack: KnowledgePack): void {
    this.packs.set(pack.id, pack);
  }

  get(id: string): KnowledgePack | undefined {
    return this.packs.get(id);
  }

  queryAcrossPacks(tags: string[]): KnowledgeFact[] {
    const results: KnowledgeFact[] = [];
    for (const pack of this.packs.values()) {
      results.push(...queryFacts(pack, tags));
    }
    return results.sort((a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key));
  }

  list(): string[] {
    return [...this.packs.keys()].sort();
  }
}
