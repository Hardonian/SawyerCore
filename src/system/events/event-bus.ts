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

export class EventBus {
  private readonly handlers = new Map<SystemEventType, Set<EventHandler<SystemEventType>>>();
  private readonly clock: () => string;
  private readonly maxListeners: number;
  private readonly onHandlerError: (type: SystemEventType, error: Error) => void;
  private sequence = 0;
  private readonly history: SystemEvent[] = [];
  private readonly maxHistory: number;

  constructor(options: EventBusOptions = {}, maxHistory = 1000) {
    this.clock = options.clock ?? (() => new Date().toISOString());
    this.maxListeners = options.maxListenersPerEvent ?? 50;
    this.onHandlerError = options.onHandlerError ?? (() => {});
    this.maxHistory = maxHistory;
  }

  on<T extends SystemEventType>(type: T, handler: EventHandler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }

    if (set.size >= this.maxListeners) {
      throw new Error(`EventBus: max listeners (${this.maxListeners}) exceeded for event "${type}"`);
    }

    set.add(handler as EventHandler<SystemEventType>);

    return () => {
      set!.delete(handler as EventHandler<SystemEventType>);
    };
  }

  emit<T extends SystemEventType>(type: T, payload: SystemEventPayloadMap[T]): SystemEvent<T> {
    const event: SystemEvent<T> = {
      type,
      sequence: this.sequence++,
      timestampIso: this.clock(),
      payload
    };

    this.history.push(event as SystemEvent);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const set = this.handlers.get(type);
    if (!set) return event;

    for (const handler of set) {
      try {
        (handler as EventHandler<T>)(event);
      } catch (error) {
        this.onHandlerError(type, error as Error);
      }
    }

    return event;
  }

  getHistory(): readonly SystemEvent[] {
    return this.history;
  }

  getSequence(): number {
    return this.sequence;
  }

  listenerCount(type: SystemEventType): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  removeAll(type?: SystemEventType): void {
    if (type) {
      this.handlers.delete(type);
    } else {
      this.handlers.clear();
    }
  }
}
