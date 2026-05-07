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
export declare class SystemState {
    private current;
    private readonly transitions;
    private readonly eventBus;
    private readonly clock;
    private transitionSequence;
    constructor(eventBus: EventBus, initial?: SystemStateName, clock?: () => string);
    get state(): SystemStateName;
    transition(to: SystemStateName, reason: string): StateTransition;
    canTransition(to: SystemStateName): boolean;
    getTransitionHistory(): readonly StateTransition[];
    isOperational(): boolean;
    isDegraded(): boolean;
}
