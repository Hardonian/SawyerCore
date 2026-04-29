/**
 * Typed event bus with monotonic sequencing.
 * Synchronous emission guarantees deterministic ordering.
 * Handler errors are caught and surfaced — never swallowed.
 */
export class EventBus {
    handlers = new Map();
    clock;
    maxListeners;
    onHandlerError;
    sequence = 0;
    history = [];
    maxHistory;
    anyHandlers = new Set();
    constructor(options = {}, maxHistory = 1000) {
        this.clock = options.clock ?? (() => new Date().toISOString());
        this.maxListeners = options.maxListenersPerEvent ?? 50;
        this.onHandlerError = options.onHandlerError ?? (() => { });
        this.maxHistory = maxHistory;
    }
    onAny(handler) {
        if (this.anyHandlers.size >= this.maxListeners) {
            throw new Error(`EventBus: max listeners (${this.maxListeners}) exceeded for wildcard event "*"`);
        }
        this.anyHandlers.add(handler);
        return () => {
            this.anyHandlers.delete(handler);
        };
    }
    on(type, handler) {
        let set = this.handlers.get(type);
        if (!set) {
            set = new Set();
            this.handlers.set(type, set);
        }
        if (set.size >= this.maxListeners) {
            throw new Error(`EventBus: max listeners (${this.maxListeners}) exceeded for event "${type}"`);
        }
        set.add(handler);
        return () => {
            set.delete(handler);
        };
    }
    emit(type, payload) {
        const event = {
            type,
            sequence: this.sequence++,
            timestampIso: this.clock(),
            payload
        };
        this.history.push(event);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        for (const handler of this.anyHandlers) {
            try {
                handler(event);
            }
            catch (error) {
                this.onHandlerError('*', error);
            }
        }
        const set = this.handlers.get(type);
        if (!set)
            return event;
        for (const handler of set) {
            try {
                handler(event);
            }
            catch (error) {
                this.onHandlerError(type, error);
            }
        }
        return event;
    }
    getHistory() {
        return this.history;
    }
    getSequence() {
        return this.sequence;
    }
    listenerCount(type) {
        return this.handlers.get(type)?.size ?? 0;
    }
    removeAll(type) {
        if (type) {
            this.handlers.delete(type);
        }
        else {
            this.handlers.clear();
        }
    }
}
