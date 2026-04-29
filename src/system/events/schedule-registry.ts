/**
 * Schedule registry — deterministic interval-based task triggers.
 * No cron dependency. Uses monotonic tick counting to fire schedules.
 * Each schedule maps to a callback and fires through the event bus.
 */

import type { EventBus } from './event-bus.js';

export interface ScheduleEntry {
  readonly id: string;
  readonly name: string;
  readonly intervalMs: number;
  readonly callback: () => void | Promise<void>;
  readonly enabled: boolean;
}

interface ScheduleState {
  entry: ScheduleEntry;
  lastFiredMs: number;
  fireCount: number;
}

export class ScheduleRegistry {
  private readonly schedules = new Map<string, ScheduleState>();
  private readonly eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  register(entry: ScheduleEntry): void {
    if (this.schedules.has(entry.id)) {
      throw new Error(`ScheduleRegistry: duplicate schedule id "${entry.id}"`);
    }
    if (entry.intervalMs < 1000) {
      throw new Error(`ScheduleRegistry: interval must be >= 1000ms, got ${entry.intervalMs}ms for "${entry.id}"`);
    }
    this.schedules.set(entry.id, {
      entry,
      lastFiredMs: 0,
      fireCount: 0
    });
  }

  unregister(id: string): boolean {
    return this.schedules.delete(id);
  }

  async tick(nowMs: number): Promise<string[]> {
    const fired: string[] = [];

    for (const [id, state] of this.schedules) {
      if (!state.entry.enabled) continue;
      if (state.lastFiredMs === 0 || nowMs - state.lastFiredMs >= state.entry.intervalMs) {
        state.lastFiredMs = nowMs;
        state.fireCount++;
        fired.push(id);

        this.eventBus.emit('SCHEDULE_FIRED', {
          scheduleId: id,
          name: state.entry.name
        });

        try {
          await state.entry.callback();
        } catch (error) {
          this.eventBus.emit('TASK_FAILED', {
            workItemId: `schedule:${id}`,
            taskId: `schedule:${id}:${state.fireCount}`,
            error: (error as Error).message,
            retriesRemaining: 0
          });
        }
      }
    }

    return fired;
  }

  list(): readonly ScheduleEntry[] {
    const results: ScheduleEntry[] = [];
    for (const s of this.schedules.values()) {
      results.push(s.entry);
    }
    return results;
  }

  getFireCount(id: string): number {
    return this.schedules.get(id)?.fireCount ?? 0;
  }
}
