import { PromptMemory } from '../memory/prompt-memory.js';
import { estimateTokens } from '../compression/compression-engine.js';
const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;
export class RecursivePromptSystem {
    build(input) {
        const fragments = new Map(input.fragments.map((fragment) => [fragment.id, fragment]));
        const memory = new PromptMemory(input.variables ?? []);
        const order = this.resolveFragmentOrder(input.rootFragmentId, fragments);
        const warnings = [];
        for (const fragmentId of order) {
            const fragment = fragments.get(fragmentId);
            if (!fragment)
                continue;
            for (const variable of fragment.variables ?? []) {
                if (memory.get(variable.name) === undefined) {
                    memory.set(variable.name, variable.value);
                }
            }
        }
        const rendered = order
            .map((fragmentId) => {
            const fragment = fragments.get(fragmentId);
            return fragment ? memory.resolve(fragment.template).trim() : '';
        })
            .filter((part) => part.length > 0)
            .join('\n\n');
        const budgeted = applyTokenBudget(rendered, input.tokenBudget);
        if (input.tokenBudget && estimateTokens(rendered) > input.tokenBudget) {
            warnings.push('prompt trimmed to token budget');
        }
        return {
            prompt: budgeted,
            tokenEstimate: estimateTokens(budgeted),
            fragmentOrder: order,
            unresolvedVariables: findUnresolvedVariables(budgeted),
            warnings
        };
    }
    resolveFragmentOrder(rootId, fragments) {
        const visited = new Set();
        const visiting = new Set();
        const order = [];
        const visit = (id) => {
            if (visited.has(id))
                return;
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
            if (fragment)
                order.push(id);
        };
        visit(rootId);
        return order.filter((id) => !id.startsWith('cycle:'));
    }
}
function applyTokenBudget(prompt, tokenBudget) {
    if (!tokenBudget || estimateTokens(prompt) <= tokenBudget)
        return prompt;
    const paragraphs = prompt.split(/\n\n+/);
    const retained = [];
    for (const paragraph of paragraphs) {
        const candidate = [...retained, paragraph].join('\n\n');
        if (estimateTokens(candidate) > tokenBudget)
            break;
        retained.push(paragraph);
    }
    return retained.join('\n\n');
}
function findUnresolvedVariables(prompt) {
    const matches = prompt.matchAll(VARIABLE_PATTERN);
    return [...new Set([...matches].map((match) => match[1]))].sort();
}
