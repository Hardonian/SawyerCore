/**
 * Schedule registry — deterministic interval-based task triggers.
 * No cron dependency. Uses monotonic tick counting to fire schedules.
 * Each schedule maps to a callback and fires through the event bus.
 */
export class ScheduleRegistry {
    schedules = new Map();
    eventBus;
    constructor(eventBus) {
        this.eventBus = eventBus;
    }
    register(entry) {
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
    unregister(id) {
        return this.schedules.delete(id);
    }
    async tick(nowMs) {
        const fired = [];
        for (const [id, state] of this.schedules) {
            if (!state.entry.enabled)
                continue;
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
                }
                catch (error) {
                    this.eventBus.emit('TASK_FAILED', {
                        workItemId: `schedule:${id}`,
                        taskId: `schedule:${id}:${state.fireCount}`,
                        error: error.message,
                        retriesRemaining: 0
                    });
                }
            }
        }
        return fired;
    }
    list() {
        return Array.from(this.schedules.values()).map((s) => s.entry);
    }
    getFireCount(id) {
        return this.schedules.get(id)?.fireCount ?? 0;
    }
}
