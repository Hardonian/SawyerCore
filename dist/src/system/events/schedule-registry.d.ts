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
export declare class ScheduleRegistry {
    private readonly schedules;
    private readonly eventBus;
    constructor(eventBus: EventBus);
    register(entry: ScheduleEntry): void;
    unregister(id: string): boolean;
    tick(nowMs: number): Promise<string[]>;
    list(): readonly ScheduleEntry[];
    getFireCount(id: string): number;
}
