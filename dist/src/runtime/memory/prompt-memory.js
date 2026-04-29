/**
 * Recursive prompt memory variables.
 * Variable substitution in prompts with cycle detection.
 * Immutable snapshots for deterministic prompt construction.
 */
export class PromptMemory {
    variables;
    static MAX_RECURSION = 32;
    static VAR_PATTERN = /\{\{(\w+)\}\}/g;
    constructor(initial = []) {
        this.variables = new Map(initial.map((v) => [v.name, v.value]));
    }
    set(name, value) {
        this.variables.set(name, value);
    }
    get(name) {
        return this.variables.get(name);
    }
    delete(name) {
        return this.variables.delete(name);
    }
    resolve(template) {
        return this.resolveRecursive(template, new Set(), 0);
    }
    resolveRecursive(template, seen, depth) {
        if (depth >= PromptMemory.MAX_RECURSION) {
            return template;
        }
        return template.replace(PromptMemory.VAR_PATTERN, (_match, varName) => {
            if (seen.has(varName)) {
                return `{{${varName}:CYCLE}}`;
            }
            const value = this.variables.get(varName);
            if (value === undefined) {
                return `{{${varName}}}`;
            }
            const nextSeen = new Set(seen);
            nextSeen.add(varName);
            return this.resolveRecursive(value, nextSeen, depth + 1);
        });
    }
    snapshot() {
        return new Map(this.variables);
    }
    toArray() {
        return [...this.variables.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([name, value]) => ({ name, value }));
    }
    size() {
        return this.variables.size;
    }
}
