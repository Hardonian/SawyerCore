/**
 * Resource monitor — CPU and memory sampling with soft/hard limits.
 * Provides real-time resource awareness for throttling decisions.
 */

import { cpus, freemem, totalmem } from 'node:os';

export interface ResourceLimits {
  maxCpuCores: number;
  memorySoftLimitBytes: number;
  memoryHardLimitBytes: number;
}

export interface ResourceSnapshot {
  cpuCount: number;
  cpuLoadAverage: number;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedBytes: number;
  memoryUsagePercent: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  rssBytes: number;
}

export type ResourcePressure = 'NOMINAL' | 'SOFT_LIMIT' | 'HARD_LIMIT';

export interface ResourceAssessment {
  snapshot: ResourceSnapshot;
  memoryPressure: ResourcePressure;
  cpuConstrained: boolean;
  shouldThrottle: boolean;
  reasons: string[];
}

const DEFAULT_LIMITS: ResourceLimits = {
  maxCpuCores: 2,
  memorySoftLimitBytes: 3 * 1024 * 1024 * 1024,
  memoryHardLimitBytes: 4 * 1024 * 1024 * 1024
};

export class ResourceMonitor {
  private readonly limits: ResourceLimits;

  constructor(limits: Partial<ResourceLimits> = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  sample(): ResourceSnapshot {
    const mem = process.memoryUsage();
    const total = totalmem();
    const free = freemem();
    const used = total - free;

    return {
      cpuCount: cpus().length,
      cpuLoadAverage: this.getCpuLoadAverage(),
      memoryTotalBytes: total,
      memoryFreeBytes: free,
      memoryUsedBytes: used,
      memoryUsagePercent: Number(((used / total) * 100).toFixed(2)),
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      rssBytes: mem.rss
    };
  }

  assess(): ResourceAssessment {
    const snapshot = this.sample();
    const reasons: string[] = [];

    let memoryPressure: ResourcePressure = 'NOMINAL';
    if (snapshot.rssBytes >= this.limits.memoryHardLimitBytes) {
      memoryPressure = 'HARD_LIMIT';
      reasons.push(`RSS ${formatBytes(snapshot.rssBytes)} exceeds hard limit ${formatBytes(this.limits.memoryHardLimitBytes)}`);
    } else if (snapshot.rssBytes >= this.limits.memorySoftLimitBytes) {
      memoryPressure = 'SOFT_LIMIT';
      reasons.push(`RSS ${formatBytes(snapshot.rssBytes)} exceeds soft limit ${formatBytes(this.limits.memorySoftLimitBytes)}`);
    }

    const cpuConstrained = snapshot.cpuCount <= this.limits.maxCpuCores;
    if (cpuConstrained && snapshot.cpuLoadAverage > 0.8) {
      reasons.push(`CPU load ${snapshot.cpuLoadAverage.toFixed(2)} on ${snapshot.cpuCount} cores`);
    }

    const shouldThrottle = memoryPressure === 'HARD_LIMIT' || (cpuConstrained && snapshot.cpuLoadAverage > 0.9);

    return {
      snapshot,
      memoryPressure,
      cpuConstrained,
      shouldThrottle,
      reasons
    };
  }

  getLimits(): Readonly<ResourceLimits> {
    return this.limits;
  }

  private getCpuLoadAverage(): number {
    const cpuList = cpus();
    if (cpuList.length === 0) return 0;
    const totalIdle = cpuList.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTick = cpuList.reduce(
      (acc, cpu) => acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq,
      0
    );
    if (totalTick === 0) return 0;
    return Number((1 - totalIdle / totalTick).toFixed(4));
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}
