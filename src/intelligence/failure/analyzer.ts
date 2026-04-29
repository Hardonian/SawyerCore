import * as fs from 'fs';
import * as path from 'path';
import { ExecutionTrace } from '../../runtime/trace/types.js';
import { FailurePattern } from './patterns.js';

export class FailureAnalyzer {
  private readonly traceFile: string;
  private readonly outputDir: string;

  constructor(
    traceFile: string = path.join(process.cwd(), 'data', 'traces', 'execution-traces.jsonl'),
    outputDir: string = path.join(process.cwd(), 'artifacts', 'intelligence')
  ) {
    this.traceFile = traceFile;
    this.outputDir = outputDir;
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  public analyze(): FailurePattern[] {
    if (!fs.existsSync(this.traceFile)) {
      return [];
    }

    const lines = fs.readFileSync(this.traceFile, 'utf-8').split('\n').filter(Boolean);
    const traces: ExecutionTrace[] = lines.map(line => JSON.parse(line));
    
    const failures = traces.filter(t => t.outcome === 'failure' || t.outcome === 'degraded');
    
    // Cluster similar failures (simplified heuristic: group by first 50 chars of error or path)
    const clusters = new Map<string, ExecutionTrace[]>();
    for (const failure of failures) {
      const key = failure.error ? failure.error.substring(0, 50) : failure.executionPath.join('->');
      const cluster = clusters.get(key) || [];
      cluster.push(failure);
      clusters.set(key, cluster);
    }

    const patterns: FailurePattern[] = [];
    let idCounter = 1;
    for (const [key, cluster] of clusters.entries()) {
      patterns.push({
        patternId: `PATTERN-${idCounter++}`,
        frequency: cluster.length,
        commonErrorTokens: [key],
        affectedPaths: [...new Set(cluster.flatMap(c => c.executionPath))],
        lastSeen: cluster[cluster.length - 1].timestamp,
        regressionDetected: cluster.length > 5 // arbitrary baseline for regression
      });
    }

    this.writeArtifacts(patterns);
    return patterns;
  }

  private writeArtifacts(patterns: FailurePattern[]) {
    fs.writeFileSync(
      path.join(this.outputDir, 'failure-patterns.json'),
      JSON.stringify(patterns, null, 2)
    );

    const md = [
      '# Failure Intelligence Summary',
      `Total Patterns Detected: ${patterns.length}`,
      ...patterns.map(p => `\n## ${p.patternId}\n- Frequency: ${p.frequency}\n- Regression: ${p.regressionDetected}\n- Paths: ${p.affectedPaths.join(', ')}\n- Tokens: ${p.commonErrorTokens[0]}`)
    ].join('\n');

    fs.writeFileSync(path.join(this.outputDir, 'failure-summary.md'), md);
  }
}
