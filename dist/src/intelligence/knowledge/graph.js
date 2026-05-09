export class KnowledgeGraph {
    nodes = [];
    edges = [];
    addNode(node) {
        if (!this.nodes.find(n => n.id === node.id)) {
            this.nodes.push(node);
        }
    }
    addEdge(edge) {
        this.edges.push(edge);
    }
    getShortcuts() {
        return this.nodes.filter(n => n.type === 'shortcut');
    }
}
