import { PromptMemory, type PromptVariable } from '../memory/prompt-memory.js';
import { estimateTokens } from '../compression/compression-engine.js';

export interface PromptFragment {
  id: string;
  template: string;
  variables?: PromptVariable[];
  dependsOn?: string[];
  priority?: number;
}

export interface PromptBuildInput {
  rootFragmentId: string;
  fragments: PromptFragment[];
  variables?: PromptVariable[];
  tokenBudget?: number;
}

export interface PromptBuildResult {
  prompt: string;
  tokenEstimate: number;
  fragmentOrder: string[];
  unresolvedVariables: string[];
  warnings: string[];
}

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

export class RecursivePromptSystem {
  build(input: PromptBuildInput): PromptBuildResult {
    const fragments = new Map(input.fragments.map((fragment) => [fragment.id, fragment]));
    const memory = new PromptMemory(input.variables ?? []);
    const order = this.resolveFragmentOrder(input.rootFragmentId, fragments);
    const warnings: string[] = [];

    // Pre-hydrate memory from fragments to avoid multiple resolve passes
    for (const fragmentId of order) {
      const fragment = fragments.get(fragmentId);
      if (fragment?.variables) {
        for (const variable of fragment.variables) {
          if (memory.get(variable.name) === undefined) {
            memory.set(variable.name, variable.value);
          }
        }
      }
    }

    const resolvedParts: string[] = [];
    for (const fragmentId of order) {
      const fragment = fragments.get(fragmentId);
      if (fragment) {
        const part = memory.resolve(fragment.template).trim();
        if (part.length > 0) {
          resolvedParts.push(part);
        }
      }
    }

    const rendered = resolvedParts.join('\n\n');
    const budgeted = applyTokenBudget(rendered, input.tokenBudget);
    
    if (input.tokenBudget) {
      const fullEstimate = estimateTokens(rendered);
      if (fullEstimate > input.tokenBudget) {
        warnings.push('prompt trimmed to token budget');
      }
    }

    return {
      prompt: budgeted,
      tokenEstimate: estimateTokens(budgeted),
      fragmentOrder: order,
      unresolvedVariables: findUnresolvedVariables(budgeted),
      warnings
    };
  }

  private resolveFragmentOrder(rootId: string, fragments: Map<string, PromptFragment>): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        order.push(`cycle:${id}`);
        return;
      }
      visiting.add(id);
      const fragment = fragments.get(id);
      const dependencies = [...(fragment?.dependsOn ?? [])].sort((a, b) => {
        const aPriority = fragments.get(a)?.priority ?? 0;
        const bPriority = fragments.get(b)?.priority ?? 0;
        return bPriority - aPriority || a.localeCompare(b);
      });
      for (const dependency of dependencies) {
        visit(dependency);
      }
      visiting.delete(id);
      visited.add(id);
      if (fragment) order.push(id);
    };

    visit(rootId);
    return order.filter((id) => !id.startsWith('cycle:'));
  }
}

function applyTokenBudget(prompt: string, tokenBudget: number | undefined): string {
  if (!tokenBudget || estimateTokens(prompt) <= tokenBudget) return prompt;
  const paragraphs = prompt.split(/\n\n+/);
  const retained: string[] = [];
  for (const paragraph of paragraphs) {
    const candidate = [...retained, paragraph].join('\n\n');
    if (estimateTokens(candidate) > tokenBudget) break;
    retained.push(paragraph);
  }
  return retained.join('\n\n');
}

function findUnresolvedVariables(prompt: string): string[] {
  const matches = prompt.matchAll(VARIABLE_PATTERN);
  return [...new Set([...matches].map((match) => match[1]))].sort();
}
