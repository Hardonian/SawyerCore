export interface KnowledgeNode {
    id: string;
    type: 'pattern' | 'rule' | 'shortcut';
    data: any;
}
export interface KnowledgeEdge {
    source: string;
    target: string;
    relationship: string;
}
export declare class KnowledgeGraph {
    nodes: KnowledgeNode[];
    edges: KnowledgeEdge[];
    addNode(node: KnowledgeNode): void;
    addEdge(edge: KnowledgeEdge): void;
    getShortcuts(): KnowledgeNode[];
}
