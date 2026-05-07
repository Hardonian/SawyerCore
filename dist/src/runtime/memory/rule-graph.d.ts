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
export declare class RuleGraph {
    private readonly nodes;
    private readonly adjacency;
    private readonly reverseAdj;
    constructor(data: RuleGraphData);
    getNode(id: string): RuleNode | undefined;
    children(id: string): string[];
    parents(id: string): string[];
    roots(): string[];
    topologicalOrder(): string[];
    evaluate(context: Record<string, string>): RuleNode[];
    nodeCount(): number;
    edgeCount(): number;
}
