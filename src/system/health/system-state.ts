/**
 * System state machine with explicit transitions.
 * States: NOMINAL → DEGRADED → CRITICAL → RECOVERING → NOMINAL
 * Also: STOPPED (terminal until restarted).
 *
 * Transitions are validated — illegal transitions throw explicit errors.
 * Every transition is logged with reason.
 */

import type { SystemStateName } from '../events/event-types.js';
import type { EventBus } from '../events/event-bus.js';

export interface StateTransition {
  readonly from: SystemStateName;
  readonly to: SystemStateName;
  readonly reason: string;
  readonly sequence: number;
  readonly timestampIso: string;
}

const VALID_TRANSITIONS: Record<SystemStateName, SystemStateName[]> = {
  NOMINAL: ['DEGRADED', 'CRITICAL', 'STOPPED'],
  DEGRADED: ['NOMINAL', 'CRITICAL', 'STOPPED'],
  CRITICAL: ['RECOVERING', 'STOPPED'],
  RECOVERING: ['NOMINAL', 'DEGRADED', 'CRITICAL', 'STOPPED'],
  STOPPED: ['NOMINAL']
};

export class SystemState {
  private current: SystemStateName;
  private readonly transitions: StateTransition[] = [];
  private readonly eventBus: EventBus;
  private readonly clock: () => string;
  private transitionSequence = 0;

  constructor(eventBus: EventBus, initial: SystemStateName = 'STOPPED', clock?: () => string) {
    this.eventBus = eventBus;
    this.current = initial;
    this.clock = clock ?? (() => new Date().toISOString());
  }

  get state(): SystemStateName {
    return this.current;
  }

  transition(to: SystemStateName, reason: string): StateTransition {
    const from = this.current;
    const allowed = VALID_TRANSITIONS[from];

    if (!allowed.includes(to)) {
      throw new Error(`SystemState: illegal transition ${from} → ${to}. Allowed: [${allowed.join(', ')}]`);
    }

    const record: StateTransition = {
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

  canTransition(to: SystemStateName): boolean {
    return VALID_TRANSITIONS[this.current].includes(to);
  }

  getTransitionHistory(): readonly StateTransition[] {
    return this.transitions;
  }

  isOperational(): boolean {
    return this.current !== 'STOPPED' && this.current !== 'CRITICAL';
  }

  isDegraded(): boolean {
    return this.current === 'DEGRADED' || this.current === 'RECOVERING';
  }
}
