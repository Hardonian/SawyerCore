/**
 * Compressed rule graph — DAG-based deterministic rule evaluation.
 * Nodes are conditions, edges are implications.
 * Traversal order is deterministic (sorted by node ID).
 */

export interface RuleNode {
  id: string;
  condition: string;
  action: string;
  weight: number;
}

export interface RuleEdge {
  from: string;
  to: string;
  label: string;
}

export interface RuleGraphData {
  nodes: RuleNode[];
  edges: RuleEdge[];
}

export class RuleGraph {
  private readonly nodes: Map<string, RuleNode>;
  private readonly adjacency: Map<string, string[]>;
  private readonly reverseAdj: Map<string, string[]>;

  constructor(data: RuleGraphData) {
    this.nodes = new Map(data.nodes.map((n) => [n.id, n]));
    this.adjacency = new Map<string, string[]>();
    this.reverseAdj = new Map<string, string[]>();

    for (const edge of data.edges) {
      const existing = this.adjacency.get(edge.from) ?? [];
      existing.push(edge.to);
      this.adjacency.set(edge.from, existing);

      const rev = this.reverseAdj.get(edge.to) ?? [];
      rev.push(edge.from);
      this.reverseAdj.set(edge.to, rev);
    }
  }

  getNode(id: string): RuleNode | undefined {
    return this.nodes.get(id);
  }

  children(id: string): string[] {
    return [...(this.adjacency.get(id) ?? [])].sort();
  }

  parents(id: string): string[] {
    return [...(this.reverseAdj.get(id) ?? [])].sort();
  }

  roots(): string[] {
    return [...this.nodes.keys()]
      .filter((id) => (this.reverseAdj.get(id) ?? []).length === 0)
      .sort();
  }

  topologicalOrder(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (id: string): void => {
      if (visited.has(id)) return;
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

  evaluate(context: Record<string, string>): RuleNode[] {
    const triggered: RuleNode[] = [];
    for (const id of this.topologicalOrder()) {
      const node = this.nodes.get(id);
      if (!node) continue;
      if (evaluateCondition(node.condition, context)) {
        triggered.push(node);
      }
    }
    return triggered.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  }

  nodeCount(): number {
    return this.nodes.size;
  }

  edgeCount(): number {
    let count = 0;
    for (const children of this.adjacency.values()) {
      count += children.length;
    }
    return count;
  }
}

function evaluateCondition(condition: string, context: Record<string, string>): boolean {
  const parts = condition.split('==').map((s) => s.trim());
  if (parts.length !== 2) return false;
  const key = parts[0];
  const expected = parts[1].replace(/^['"]|['"]$/g, '');
  return context[key] === expected;
}
