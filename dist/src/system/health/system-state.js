/**
 * System state machine with explicit transitions.
 * States: NOMINAL → DEGRADED → CRITICAL → RECOVERING → NOMINAL
 * Also: STOPPED (terminal until restarted).
 *
 * Transitions are validated — illegal transitions throw explicit errors.
 * Every transition is logged with reason.
 */
const VALID_TRANSITIONS = {
    NOMINAL: ['DEGRADED', 'CRITICAL', 'STOPPED'],
    DEGRADED: ['NOMINAL', 'CRITICAL', 'STOPPED'],
    CRITICAL: ['RECOVERING', 'STOPPED'],
    RECOVERING: ['NOMINAL', 'DEGRADED', 'CRITICAL', 'STOPPED'],
    STOPPED: ['NOMINAL']
};
export class SystemState {
    current;
    transitions = [];
    eventBus;
    clock;
    transitionSequence = 0;
    constructor(eventBus, initial = 'STOPPED', clock) {
        this.eventBus = eventBus;
        this.current = initial;
        this.clock = clock ?? (() => new Date().toISOString());
    }
    get state() {
        return this.current;
    }
    transition(to, reason) {
        const from = this.current;
        const allowed = VALID_TRANSITIONS[from];
        if (!allowed.includes(to)) {
            throw new Error(`SystemState: illegal transition ${from} → ${to}. Allowed: [${allowed.join(', ')}]`);
        }
        const record = {
            from,
            to,
            reason,
            sequence: this.transitionSequence++,
            timestampIso: this.clock()
        };
        this.transitions.push(record);
        this.current = to;
        this.eventBus.emit('STATE_TRANSITION', { from, to, reason });
        return record;
    }
    canTransition(to) {
        return VALID_TRANSITIONS[this.current].includes(to);
    }
    getTransitionHistory() {
        return this.transitions;
    }
    isOperational() {
        return this.current !== 'STOPPED' && this.current !== 'CRITICAL';
    }
    isDegraded() {
        return this.current === 'DEGRADED' || this.current === 'RECOVERING';
    }
}
