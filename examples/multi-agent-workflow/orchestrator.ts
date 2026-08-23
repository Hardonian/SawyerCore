/**
 * Multi-Agent Orchestration Workflow
 * Demonstrates composing multiple specialized agents, sharing context via Knowledge Packs,
 * and executing deterministic rule graphs.
 */

import { KnowledgePack, RuleGraph } from '../../src/runtime/memory.js';

async function main() {
  console.log('=== Starting Sawyer Multi-Agent Orchestration ===');

  // 1. Initialize Shared Knowledge Pack
  const kb = new KnowledgePack('incident-response-pack', 'v1.0.0');
  kb.addFact('cluster.region', 'us-east-edge', 1.0, ['infrastructure']);
  kb.addFact('safety.threshold.temp', 85.0, 1.0, ['safety']);
  kb.addFact('active.anomaly', 'thermal_spike', 0.95, ['telemetry']);

  console.log(`Knowledge Pack initialized with checksum: ${kb.checksum()}`);

  // 2. Define Rule Graph for Agent Decisioning
  const graph = new RuleGraph();
  graph.addRule({
    id: 'rule-detect-overheat',
    condition: 'active.anomaly === thermal_spike',
    action: 'DISPATCH_COOLING_AGENT',
    priority: 100,
  });

  graph.addRule({
    id: 'rule-throttle-compute',
    condition: 'cluster.region === us-east-edge',
    action: 'THROTTLE_EDGE_COMPUTE',
    priority: 90,
  });

  graph.addDependency('rule-detect-overheat', 'rule-throttle-compute');

  // 3. Evaluate Rule Graph
  const executionOrder = graph.getExecutionOrder();
  console.log('\nTopological Execution Order:');
  executionOrder.forEach((ruleId, index) => {
    console.log(`  Step ${index + 1}: ${ruleId}`);
  });

  // 4. Execute Context Evaluation
  const facts = kb.queryFacts();
  console.log('\nShared Facts Available to Agents:');
  facts.forEach((fact) => {
    console.log(`  - [${fact.key}] = ${JSON.stringify(fact.value)} (confidence: ${fact.confidence})`);
  });

  console.log('\n✅ Multi-agent orchestration completed nominal.');
}

main().catch(console.error);
