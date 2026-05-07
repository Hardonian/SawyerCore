/**
 * Compressed rule graph — DAG-based deterministic rule evaluation.
 * Nodes are conditions, edges are implications.
 * Traversal order is deterministic (sorted by node ID).
 */
export class RuleGraph {
    nodes;
    adjacency;
    reverseAdj;
    constructor(data) {
        this.nodes = new Map(data.nodes.map((n) => [n.id, n]));
        this.adjacency = new Map();
        this.reverseAdj = new Map();
        for (const edge of data.edges) {
            const existing = this.adjacency.get(edge.from) ?? [];
            existing.push(edge.to);
            this.adjacency.set(edge.from, existing);
            const rev = this.reverseAdj.get(edge.to) ?? [];
            rev.push(edge.from);
            this.reverseAdj.set(edge.to, rev);
        }
    }
    getNode(id) {
        return this.nodes.get(id);
    }
    children(id) {
        return [...(this.adjacency.get(id) ?? [])].sort();
    }
    parents(id) {
        return [...(this.reverseAdj.get(id) ?? [])].sort();
    }
    roots() {
        return [...this.nodes.keys()]
            .filter((id) => (this.reverseAdj.get(id) ?? []).length === 0)
            .sort();
    }
    topologicalOrder() {
        const visited = new Set();
        const result = [];
        const visit = (id) => {
            if (visited.has(id))
                return;
            visited.add(id);
            for (const child of this.children(id)) {
                visit(child);
            }
            result.push(id);
        };
        for (const root of this.roots()) {
            visit(root);
        }
        return result.reverse();
    }
    evaluate(context) {
        const triggered = [];
        for (const id of this.topologicalOrder()) {
            const node = this.nodes.get(id);
            if (!node)
                continue;
            if (evaluateCondition(node.condition, context)) {
                triggered.push(node);
            }
        }
        return triggered.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
    }
    nodeCount() {
        return this.nodes.size;
    }
    edgeCount() {
        let count = 0;
        for (const children of this.adjacency.values()) {
            count += children.length;
        }
        return count;
    }
}
function evaluateCondition(condition, context) {
    const parts = condition.split('==').map((s) => s.trim());
    if (parts.length !== 2)
        return false;
    const key = parts[0];
    const expected = parts[1].replace(/^['"]|['"]$/g, '');
    return context[key] === expected;
}
