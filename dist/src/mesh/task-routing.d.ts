import { AiTask } from '../types/contracts.js';
import { Node } from './node-registry.js';
export interface RouteMetric {
    latency: number;
    cost: number;
    resourceAvailability: number;
}
export declare class TaskRouter {
    selectNode(task: AiTask): Node | null;
    private calculateScore;
}
