import { AiTask } from '../types/contracts.js';
import { globalRegistry, Node } from './node-registry.js';

export interface RouteMetric {
  latency: number;
  cost: number;
  resourceAvailability: number;
}

export class TaskRouter {
  selectNode(task: AiTask): Node | null {
    const candidates = globalRegistry.getNodesWithCapability(task.requiredCapability)
      .filter(n => n.status === 'online' || n.status === 'active');

    if (candidates.length === 0) {
      return null; // Degrade to local if mesh unavailable handled by caller
    }

    // Sort by best fit
    return candidates.sort((a, b) => {
      const scoreA = this.calculateScore(a, task);
      const scoreB = this.calculateScore(b, task);
      return scoreB - scoreA;
    })[0];
  }

  private calculateScore(node: Node, task: AiTask): number {
    const cpu = node.metadata.cpu || 1;
    const activeTasks = node.metadata.activeTasks || 0;
    
    // Simple heuristic: higher availability (lower CPU/tasks) is better
    // Latency and cost weighting would be added here
    const availability = 1 / (cpu * (activeTasks + 1));
    
    // Privacy constraint: if task is local-only, we shouldn't even be routing, 
    // but we double check here.
    if (task.privacyRequirement === 'local-only') return -1;

    return availability;
  }
}
