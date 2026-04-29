/**
 * Autonomy loop — the 24/7 main controller.
 * Coordinates task detection, workflow execution, health checks,
 * self-healing, and scheduled triggers in a single controlled loop.
 *
 * Uses AbortController for clean shutdown — no dangling timers.
 * Each tick is a complete cycle: detect → execute → heal → report.
 */

import type { WorkflowOrchestrator, WorkflowResult } from './workflow-orchestrator.js';
import type { TaskDetector } from './task-detector.js';
import type { HealthAggregator, SystemHealthReport } from '../health/health-aggregator.js';
import type { SelfHealer } from '../health/self-healer.js';
import type { SystemState } from '../health/system-state.js';
import type { EventBus } from '../events/event-bus.js';
import type { ScheduleRegistry } from '../events/schedule-registry.js';
import type { HealingAction } from '../events/event-types.js';

export interface AutonomyLoopConfig {
  tickIntervalMs: number;
  maxTasksPerTick: number;
  healthCheckIntervalTicks: number;
  providerNames: string[];
}

const DEFAULT_LOOP_CONFIG: AutonomyLoopConfig = {
  tickIntervalMs: 5000,
  maxTasksPerTick: 10,
  healthCheckIntervalTicks: 5,
  providerNames: []
};

export interface TickReport {
  tickNumber: number;
  tasksProcessed: number;
  results: WorkflowResult[];
  healthReport: SystemHealthReport | null;
  healingActions: HealingAction[];
  scheduledFired: string[];
  durationMs: number;
}

export class AutonomyLoop {
  private readonly orchestrator: WorkflowOrchestrator;
  private readonly taskDetector: TaskDetector;
  private readonly healthAggregator: HealthAggregator;
  private readonly selfHealer: SelfHealer;
  private readonly systemState: SystemState;
  private readonly eventBus: EventBus;
  private readonly scheduleRegistry: ScheduleRegistry;
  private readonly config: AutonomyLoopConfig;

  private running = false;
  private tickNumber = 0;
  private abortController: AbortController | null = null;

  constructor(
    orchestrator: WorkflowOrchestrator,
    taskDetector: TaskDetector,
    healthAggregator: HealthAggregator,
    selfHealer: SelfHealer,
    systemState: SystemState,
    eventBus: EventBus,
    scheduleRegistry: ScheduleRegistry,
    config: Partial<AutonomyLoopConfig> = {}
  ) {
    this.orchestrator = orchestrator;
    this.taskDetector = taskDetector;
    this.healthAggregator = healthAggregator;
    this.selfHealer = selfHealer;
    this.systemState = systemState;
    this.eventBus = eventBus;
    this.scheduleRegistry = scheduleRegistry;
    this.config = { ...DEFAULT_LOOP_CONFIG, ...config };
  }

  async start(): Promise<void> {
    if (this.running) {
      throw new Error('AutonomyLoop: already running');
    }

    this.running = true;
    this.abortController = new AbortController();

    this.systemState.transition('NOMINAL', 'autonomy loop started');
    this.healthAggregator.markStarted();

    this.eventBus.emit('SYSTEM_STARTED', {
      tickIntervalMs: this.config.tickIntervalMs,
      providers: this.config.providerNames
    });

    await this.runLoop(this.abortController.signal);
  }

  stop(reason = 'manual stop'): void {
    if (!this.running) return;

    this.running = false;
    this.abortController?.abort();
    this.abortController = null;

    const uptimeMs = Math.round(performance.now());

    if (this.systemState.canTransition('STOPPED')) {
      this.systemState.transition('STOPPED', reason);
    }

    this.eventBus.emit('SYSTEM_STOPPED', { reason, uptimeMs });
  }

  async executeTick(): Promise<TickReport> {
    const startMs = performance.now();
    const currentTick = this.tickNumber++;
    this.healthAggregator.incrementTick();

    const nowMs = Date.now();
    const scheduledFired = await this.scheduleRegistry.tick(nowMs);

    const results: WorkflowResult[] = [];
    let processed = 0;

    while (processed < this.config.maxTasksPerTick && this.taskDetector.pendingCount() > 0) {
      if (!this.systemState.isOperational()) break;

      const result = await this.orchestrator.processNext();
      if (!result) break;

      results.push(result);
      processed++;
    }

    let healthReport: SystemHealthReport | null = null;
    let healingActions: HealingAction[] = [];

    if (currentTick % this.config.healthCheckIntervalTicks === 0 || !this.systemState.isOperational()) {
      healthReport = await this.healthAggregator.collectHealth();
      healingActions = this.selfHealer.evaluate(healthReport);
    }

    const durationMs = Math.round(performance.now() - startMs);

    this.eventBus.emit('TICK_COMPLETED', {
      tickNumber: currentTick,
      tasksProcessed: processed,
      durationMs
    });

    return {
      tickNumber: currentTick,
      tasksProcessed: processed,
      results,
      healthReport,
      healingActions,
      scheduledFired,
      durationMs
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  getTickNumber(): number {
    return this.tickNumber;
  }

  private async runLoop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      await this.executeTick();
      await this.sleep(this.config.tickIntervalMs, signal);
    }
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      const timer = setTimeout(resolve, ms);

      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
