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
    currentSizeBytes = 0;
    constructor(config = {}) {
        this.config = {
            filePath: config.filePath ?? DEFAULT_LOG_CONFIG.filePath,
            rotateBytes: config.rotateBytes ?? DEFAULT_LOG_CONFIG.rotateBytes
        };
        mkdirSync(dirname(this.config.filePath), { recursive: true });
        // Initialize size tracker
        if (existsSync(this.config.filePath)) {
            this.currentSizeBytes = statSync(this.config.filePath).size;
        }
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
        const loaded = raw
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .map((line) => JSON.parse(line));
        this.entries.push(...loaded);
        return loaded;
    }
    persistEntry(entry) {
        const data = `${JSON.stringify(entry)}\n`;
        const dataSize = Buffer.byteLength(data, 'utf8');
        if (this.currentSizeBytes + dataSize >= this.config.rotateBytes) {
            const rotatedPath = `${this.config.filePath}.${Date.now()}.bak`;
            try {
                renameSync(this.config.filePath, rotatedPath);
                this.currentSizeBytes = 0;
            }
            catch {
                // Fallback or ignore if rename fails
            }
        }
        appendFileSync(this.config.filePath, data, { encoding: 'utf8' });
        this.currentSizeBytes += dataSize;
    }
}
