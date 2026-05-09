import { describe, it, expect } from 'vitest';
import { EventBus } from '../../src/system/events/event-bus.js';
import { attachAuditLoggerToEventBus } from '../../src/system/events/audit-integration.js';
import { TaskDetector } from '../../src/system/autonomy/task-detector.js';
import { IntentResolver } from '../../src/system/autonomy/intent-resolver.js';
import { WorkflowOrchestrator } from '../../src/system/autonomy/workflow-orchestrator.js';
import { HealthAggregator } from '../../src/system/health/health-aggregator.js';
import { SystemState } from '../../src/system/health/system-state.js';
import { AutonomyLoop } from '../../src/system/autonomy/autonomy-loop.js';
import { DeterministicEngine } from '../../src/runtime/core/deterministic-engine.js';
import { AuditLogger, InMemoryAuditSink } from '../../src/observability/audit.js';
import { safeDefaultConfig } from '../../src/runtime/defaults.js';
import { MockProvider } from '../../src/providers/providers.js';
import { ResourceMonitor } from '../../src/runtime/safety/resource-monitor.js';
import { SelfHealer } from '../../src/system/health/self-healer.js';
import { ScheduleRegistry } from '../../src/system/events/schedule-registry.js';

describe('Autonomy System Integration', () => {
  it('should process a task end-to-end through the autonomy loop', async () => {
    const eventBus = new EventBus();
    const taskDetector = new TaskDetector(eventBus);
    const intentResolver = new IntentResolver();
    const systemState = new SystemState(eventBus);
    const providers = [new MockProvider('mock-gpu')];
    const resourceMonitor = new ResourceMonitor();
    const healthAggregator = new HealthAggregator(providers, resourceMonitor, systemState, eventBus);
    const selfHealer = new SelfHealer(eventBus, systemState);
    const scheduleRegistry = new ScheduleRegistry(eventBus);
    
    const config = safeDefaultConfig();
    const auditSink = new InMemoryAuditSink();
    const audit = new AuditLogger(auditSink);
    
    // Attach event bus to audit logger
    attachAuditLoggerToEventBus(eventBus, audit);

    const engine = new DeterministicEngine(providers, config, audit);
    
    const orchestrator = new WorkflowOrchestrator(
      engine,
      taskDetector,
      intentResolver,
      healthAggregator,
      eventBus
    );
    
    const loop = new AutonomyLoop(
      orchestrator,
      taskDetector,
      healthAggregator,
      selfHealer,
      systemState,
      eventBus,
      scheduleRegistry,
      { tickIntervalMs: 10 }
    );
    
    // Enqueue a task
    taskDetector.enqueue('summarize critical alert', 'HIGH');
    
    // Start loop
    const loopPromise = loop.start();
    
    // Wait for process to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    
    loop.stop();
    await loopPromise;
    
    // Assert task was processed
    const stats = taskDetector.getStats();
    expect(stats.completed).toBe(1);
    expect(stats.pending).toBe(0);
    
    const auditLogs = audit.list();
    expect(auditLogs.length).toBeGreaterThan(0);
    
    // Verify our integration logged a system event
    const systemEvents = auditLogs.filter(log => log.status === 'system_event');
    expect(systemEvents.length).toBeGreaterThan(0);
  });
});
