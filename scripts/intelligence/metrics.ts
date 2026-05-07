import * as fs from 'fs';
import * as path from 'path';
import { ExecutionTrace } from '../../src/runtime/trace/types.js';

function computeMetrics() {
  const traceFile = path.join(process.cwd(), 'data', 'traces', 'execution-traces.jsonl');
  const outputDir = path.join(process.cwd(), 'artifacts', 'intelligence');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (!fs.existsSync(traceFile)) {
    console.log('No traces found. Skipping metrics.');
    return;
  }

  const lines = fs.readFileSync(traceFile, 'utf-8').split('\n').filter(Boolean);
  const traces: ExecutionTrace[] = lines.map(line => JSON.parse(line));
  const total = traces.length;

  if (total === 0) return;

  const successes = traces.filter(t => t.outcome === 'success').length;
  const degraded = traces.filter(t => t.outcome === 'degraded').length;
  const fallbacks = traces.filter(t => t.fallbackUsage).length;
  const avgLatency = traces.reduce((sum, t) => sum + t.cost.timeMs, 0) / total;
  
  let avgTokens = 0;
  const tokenTraces = traces.filter(t => t.cost.tokens?.totalTokens);
  if (tokenTraces.length > 0) {
    avgTokens = tokenTraces.reduce((sum, t) => sum + (t.cost.tokens?.totalTokens || 0), 0) / tokenTraces.length;
  }

  const metrics = {
    totalRuns: total,
    successRate: successes / total,
    degradedFrequency: degraded / total,
    fallbackFrequency: fallbacks / total,
    avgLatencyMs: avgLatency,
    avgCostTokens: avgTokens,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync(
    path.join(outputDir, 'performance.json'),
    JSON.stringify(metrics, null, 2)
  );

  const md = [
    '# System Performance Baseline',
    `- **Total Runs**: ${metrics.totalRuns}`,
    `- **Success Rate**: ${(metrics.successRate * 100).toFixed(2)}%`,
    `- **Avg Latency**: ${metrics.avgLatencyMs.toFixed(2)}ms`,
    `- **Avg Token Cost**: ${metrics.avgCostTokens.toFixed(2)}`,
    `- **Fallback Frequency**: ${(metrics.fallbackFrequency * 100).toFixed(2)}%`,
    `- **Degraded Frequency**: ${(metrics.degradedFrequency * 100).toFixed(2)}%`,
    `\n*Generated at: ${metrics.timestamp}*`
  ].join('\n');

  fs.writeFileSync(path.join(outputDir, 'performance.md'), md);
  console.log('Metrics computed successfully.');
}

computeMetrics();
