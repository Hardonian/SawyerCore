# Developer Guide: SawyerCore SDK

The SawyerCore SDK provides a unified interface for building plugins and external integrations.

## Core Concepts

### Task Invocation
Use `SawyerPlugin.invokeTask` to request capabilities from the runtime.

```typescript
const result = await SawyerPlugin.invokeTask('code-review', { code: '...' });
if (result.status === 'DEGRADED') {
  // Handle local/constrained execution
}
```

### Deterministic Traces
Every SDK interaction is associated with a `traceId`. Ensure you preserve this ID in your plugin's internal logic to maintain system-wide observability.

### Error Handling
The SDK returns typed `TaskResult` objects. Never swallow errors; always propagate them back to the runtime to allow for automated recovery or logging.

## Best Practices
1. **Request Minimal Permissions**: Only ask for what you need in your manifest.
2. **Handle Offline States**: Assume the system might be offline. Provide useful local logic where possible.
3. **Respect Resource Limits**: Optimize your code to stay within the declared memory and CPU bounds.
