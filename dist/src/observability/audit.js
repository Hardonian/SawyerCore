import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
export class InMemoryAuditSink {
    events = [];
    filePath;
    rotateBytes;
    constructor(options = {}) {
        this.filePath = options.filePath;
        this.rotateBytes = options.rotateBytes ?? 5 * 1024 * 1024;
        if (this.filePath) {
            mkdirSync(dirname(this.filePath), { recursive: true });
        }
    }
    write(event) {
        this.events.push(event);
        if (!this.filePath)
            return;
        if (existsSync(this.filePath) && statSync(this.filePath).size >= this.rotateBytes) {
            renameSync(this.filePath, `${this.filePath}.${Date.now()}.bak`);
        }
        appendFileSync(this.filePath, `${JSON.stringify(event)}\n`, { encoding: 'utf8' });
    }
    log(event) {
        const withTimestamp = {
            ...event,
            timestamp: new Date().toISOString()
        };
        this.write(withTimestamp);
    }
    read() {
        return [...this.events];
    }
}
export class JsonlAuditSink {
    path;
    constructor(path = '.sawyer-audit.jsonl') {
        this.path = path;
    }
    write(event) {
        appendFileSync(this.path, `${JSON.stringify(event)}\n`, 'utf8');
    }
    read() {
        return [];
    }
}
function sanitize(event) {
    return {
        ...event,
        deniedProviders: event.deniedProviders?.map((item) => ({
            provider: item.provider,
            reason: item.reason.replace(/(api[_-]?key|token|secret)=\S+/gi, '$1=[redacted]')
        }))
    };
}
export class AuditLogger {
    sink;
    constructor(sink = new InMemoryAuditSink()) {
        this.sink = sink;
    }
    log(event) {
        const withTimestamp = {
            ...event,
            timestamp: new Date().toISOString()
        };
        this.sink.write(sanitize(withTimestamp));
    }
    list() {
        return this.sink.read();
    }
}
