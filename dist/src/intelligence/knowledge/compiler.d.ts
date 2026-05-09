import { KnowledgeGraph } from './graph.js';
import { FailurePattern } from '../failure/patterns.js';
import { IntelligenceRule } from '../policy/rule-engine.js';
export declare class KnowledgeCompiler {
    compile(patterns: FailurePattern[], rules: IntelligenceRule[]): KnowledgeGraph;
}
