import { KnowledgeGraph } from './graph.js';
import { FailurePattern } from '../failure/patterns.js';
import { IntelligenceRule } from '../policy/rule-engine.js';

export class KnowledgeCompiler {
  public compile(patterns: FailurePattern[], rules: IntelligenceRule[]): KnowledgeGraph {
    const graph = new KnowledgeGraph();

    patterns.forEach(p => {
      graph.addNode({ id: p.patternId, type: 'pattern', data: p });
    });

    rules.forEach(r => {
      graph.addNode({ id: r.id, type: 'rule', data: r });
      
      // If a rule dictates an action, create a shortcut
      const shortcutId = `SC-${r.id}`;
      graph.addNode({
        id: shortcutId,
        type: 'shortcut',
        data: { condition: r.condition, action: r.action }
      });
      graph.addEdge({ source: r.id, target: shortcutId, relationship: 'generates' });
    });

    return graph;
  }
}
