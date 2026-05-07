import type { EventBus } from './event-bus.js';
import type { AuditLogger } from '../../observability/audit.js';

/**
 * Binds the global EventBus to the AuditLogger.
 * Ensures the entire autonomous history is persistent and replayable.
 */
export function attachAuditLoggerToEventBus(bus: EventBus, audit: AuditLogger): () => void {
  return bus.onAny((event) => {
    audit.log({
      status: 'system_event',
      systemEvent: event
    });
  });
}
