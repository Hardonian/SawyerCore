/**
 * Typed event bus with monotonic sequencing.
 * Synchronous emission guarantees deterministic ordering.
 * Handler errors are caught and surfaced — never swallowed.
 */
import type { SystemEvent, SystemEventType, SystemEventPayloadMap } from './event-types.js';
export type EventHandler<T extends SystemEventType> = (event: SystemEvent<T>) => void;
export interface EventBusOptions {
    clock?: () => string;
    maxListenersPerEvent?: number;
    onHandlerError?: (type: SystemEventType, error: Error) => void;
}
export declare class EventBus {
    private readonly handlers;
    private readonly clock;
    private readonly maxListeners;
    private readonly onHandlerError;
    private sequence;
    private readonly history;
    private readonly maxHistory;
    private readonly anyHandlers;
    constructor(options?: EventBusOptions, maxHistory?: number);
    onAny(handler: (event: SystemEvent) => void): () => void;
    on<T extends SystemEventType>(type: T, handler: EventHandler<T>): () => void;
    emit<T extends SystemEventType>(type: T, payload: SystemEventPayloadMap[T]): SystemEvent<T>;
    getHistory(): readonly SystemEvent[];
    getSequence(): number;
    listenerCount(type: SystemEventType): number;
    removeAll(type?: SystemEventType): void;
}
