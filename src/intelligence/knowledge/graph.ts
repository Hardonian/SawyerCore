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

export class KnowledgeGraph {
  public nodes: KnowledgeNode[] = [];
  public edges: KnowledgeEdge[] = [];

  public addNode(node: KnowledgeNode) {
    if (!this.nodes.find(n => n.id === node.id)) {
      this.nodes.push(node);
    }
  }

  public addEdge(edge: KnowledgeEdge) {
    this.edges.push(edge);
  }

  public getShortcuts(): KnowledgeNode[] {
    return this.nodes.filter(n => n.type === 'shortcut');
  }
}
