/**
 * Recursive prompt memory variables.
 * Variable substitution in prompts with cycle detection.
 * Immutable snapshots for deterministic prompt construction.
 */

export interface PromptVariable {
  name: string;
  value: string;
}

export class PromptMemory {
  private readonly variables: Map<string, string>;
  private static readonly MAX_RECURSION = 32;
  private static readonly VAR_PATTERN = /\{\{(\w+)\}\}/g;

  constructor(initial: PromptVariable[] = []) {
    this.variables = new Map(initial.map((v) => [v.name, v.value]));
  }

  set(name: string, value: string): void {
    this.variables.set(name, value);
  }

  get(name: string): string | undefined {
    return this.variables.get(name);
  }

  delete(name: string): boolean {
    return this.variables.delete(name);
  }

  resolve(template: string): string {
    return this.resolveRecursive(template, new Set<string>(), 0);
  }

  private resolveRecursive(template: string, seen: Set<string>, depth: number): string {
    if (depth >= PromptMemory.MAX_RECURSION) {
      return template;
    }

    return template.replace(PromptMemory.VAR_PATTERN, (_match, varName: string) => {
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

  snapshot(): ReadonlyMap<string, string> {
    return new Map(this.variables);
  }

  toArray(): PromptVariable[] {
    return [...this.variables.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, value]) => ({ name, value }));
  }

  size(): number {
    return this.variables.size;
  }
}
