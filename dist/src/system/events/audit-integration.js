/**
 * Binds the global EventBus to the AuditLogger.
 * Ensures the entire autonomous history is persistent and replayable.
 */
export function attachAuditLoggerToEventBus(bus, audit) {
    return bus.onAny((event) => {
        audit.log({
            status: 'system_event',
            systemEvent: event
        });
    });
}
