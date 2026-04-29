/**
 * Replayable execution log — append-only JSONL with full provenance.
 * Every execution is recorded with input/output hashes for integrity verification.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
const DEFAULT_LOG_CONFIG = {
    filePath: '.sawyer/execution.jsonl',
    rotateBytes: 10 * 1024 * 1024
};
export class ExecutionLog {
    config;
    entries = [];
    constructor(config = {}) {
        this.config = {
            filePath: config.filePath ?? DEFAULT_LOG_CONFIG.filePath,
            rotateBytes: config.rotateBytes ?? DEFAULT_LOG_CONFIG.rotateBytes
        };
        mkdirSync(dirname(this.config.filePath), { recursive: true });
    }
    append(entry) {
        this.entries.push(entry);
        this.persistEntry(entry);
    }
    getEntries() {
        return this.entries;
    }
    findByRunId(runId) {
        return this.entries.find((e) => e.runId === runId);
    }
    getLatest() {
        return this.entries[this.entries.length - 1];
    }
    replay() {
        if (!existsSync(this.config.filePath)) {
            return [];
        }
        const raw = readFileSync(this.config.filePath, 'utf8');
        return raw
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .map((line) => JSON.parse(line));
    }
    persistEntry(entry) {
        if (existsSync(this.config.filePath) && statSync(this.config.filePath).size >= this.config.rotateBytes) {
            const rotatedPath = `${this.config.filePath}.${Date.now()}.bak`;
            renameSync(this.config.filePath, rotatedPath);
        }
        appendFileSync(this.config.filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
    }
}
