/**
 * Health aggregator — collects truth-based health from all subsystems.
 * No synthetic metrics. Every value is measured or derived from measured values.
 *
 * Subsystems register health probes. The aggregator polls them
 * and produces a SystemHealthReport with deterministic grading.
 */

import type { ResourceMonitor, ResourceAssessment } from '../../runtime/safety/resource-monitor.js';
import type { RuntimeProvider, ProviderHealth } from '../../providers/provider.js';
import type { EventBus } from '../events/event-bus.js';
import type { SystemStateName } from '../events/event-types.js';
import type { SystemState } from './system-state.js';

export interface ProviderHealthEntry {
  name: string;
  healthy: boolean;
  reason: string | null;
}

export interface SystemHealthReport {
  readonly state: SystemStateName;
  readonly uptimeMs: number;
  readonly tickCount: number;
  readonly providers: readonly ProviderHealthEntry[];
  readonly healthyProviderCount: number;
  readonly totalProviderCount: number;
  readonly resource: ResourceAssessment;
  readonly recentFailureCount: number;
  readonly recentSuccessCount: number;
  readonly successRate: number;
  readonly timestampIso: string;
}

export interface HealthAggregatorConfig {
  failureWindowSize: number;
  clock?: () => string;
}

const DEFAULT_CONFIG: HealthAggregatorConfig = {
  failureWindowSize: 100
};

export class HealthAggregator {
  private readonly providers: RuntimeProvider[];
  private readonly resourceMonitor: ResourceMonitor;
  private readonly systemState: SystemState;
  private readonly eventBus: EventBus;
  private readonly config: HealthAggregatorConfig;
  private readonly clock: () => string;

  private startTimeMs: number | null = null;
  private tickCount = 0;
  private readonly resultWindow: boolean[] = [];

  constructor(
    providers: RuntimeProvider[],
    resourceMonitor: ResourceMonitor,
    systemState: SystemState,
    eventBus: EventBus,
    config: Partial<HealthAggregatorConfig> = {}
  ) {
    this.providers = providers;
    this.resourceMonitor = resourceMonitor;
    this.systemState = systemState;
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.clock = this.config.clock ?? (() => new Date().toISOString());
  }

  markStarted(): void {
    this.startTimeMs = performance.now();
  }

  incrementTick(): void {
    this.tickCount++;
  }

  recordResult(success: boolean): void {
    this.resultWindow.push(success);
    if (this.resultWindow.length > this.config.failureWindowSize) {
      this.resultWindow.shift();
    }
  }

  async collectHealth(): Promise<SystemHealthReport> {
    const providerHealth = await this.probeProviders();
    const resource = this.resourceMonitor.assess();
    const healthyCount = providerHealth.filter((p) => p.healthy).length;

    const failures = this.resultWindow.filter((r) => !r).length;
    const successes = this.resultWindow.filter((r) => r).length;
    const total = this.resultWindow.length;
    const successRate = total > 0 ? Number((successes / total).toFixed(4)) : 1;

    const report: SystemHealthReport = {
      state: this.systemState.state,
      uptimeMs: this.startTimeMs !== null ? Math.round(performance.now() - this.startTimeMs) : 0,
      tickCount: this.tickCount,
      providers: providerHealth,
      healthyProviderCount: healthyCount,
      totalProviderCount: this.providers.length,
      resource,
      recentFailureCount: failures,
      recentSuccessCount: successes,
      successRate,
      timestampIso: this.clock()
    };

    this.eventBus.emit('HEALTH_CHECK', {
      state: report.state,
      providerHealth: Object.fromEntries(providerHealth.map((p) => [p.name, p.healthy])),
      memoryPressure: resource.memoryPressure
    });

    return report;
  }

  getTickCount(): number {
    return this.tickCount;
  }

  private async probeProviders(): Promise<ProviderHealthEntry[]> {
    const entries: ProviderHealthEntry[] = [];
    for (const provider of this.providers) {
      let health: ProviderHealth;
      try {
        health = await provider.healthCheck();
      } catch (error) {
        health = { healthy: false, reason: (error as Error).message };
      }
      entries.push({
        name: provider.name,
        healthy: health.healthy,
        reason: health.reason ?? null
      });
    }
    return entries;
  }
}
