/**
 * Structured knowledge packs — local-first intelligence without heavy RAG/vector DB.
 * Knowledge is stored as typed JSON with deterministic lookup.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
export function loadKnowledgePack(path) {
    if (!existsSync(path))
        return null;
    const raw = readFileSync(path, 'utf8');
    const pack = JSON.parse(raw);
    const actualChecksum = computePackChecksum(pack);
    if (pack.checksum && pack.checksum !== actualChecksum) {
        return null;
    }
    return pack;
}
export function computePackChecksum(pack) {
    const canonical = JSON.stringify({
        id: pack.id,
        version: pack.version,
        facts: pack.facts,
        rules: pack.rules
    });
    return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
export function queryFacts(pack, tags) {
    if (tags.length === 0)
        return [...pack.facts];
    return pack.facts
        .filter((f) => tags.some((t) => f.tags.includes(t)))
        .sort((a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key));
}
export function queryRules(pack, conditionSubstring) {
    return pack.rules
        .filter((r) => r.condition.includes(conditionSubstring))
        .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}
export class KnowledgePackRegistry {
    packs = new Map();
    register(pack) {
        this.packs.set(pack.id, pack);
    }
    get(id) {
        return this.packs.get(id);
    }
    queryAcrossPacks(tags) {
        const results = [];
        for (const pack of this.packs.values()) {
            results.push(...queryFacts(pack, tags));
        }
        return results.sort((a, b) => b.confidence - a.confidence || a.key.localeCompare(b.key));
    }
    list() {
        return [...this.packs.keys()].sort();
    }
}
