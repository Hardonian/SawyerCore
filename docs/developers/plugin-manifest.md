# Plugin Manifest Specification

The `manifest.json` file is required for every SawyerCore plugin. It defines the identity, permissions, and resource requirements of the plugin.

## Schema

### Identity

- `id`: Unique string identifier (reverse DNS recommended, e.g., `com.company.plugin`)
- `name`: Human-readable name
- `version`: SemVer string
- `description`: Short summary of functionality
- `author`: Name or organization

### Execution

- `entryPoint`: Relative path to the main JavaScript file.

### Permissions

The `permissions` object defines what the plugin is allowed to do.

- `network`: Boolean. If true, allows outbound network requests.
- `allowedDomains`: List of strings. Restricts network access to specific domains.
- `filesystem`: One of `NONE`, `READ`, `READ_WRITE`.
- `allowedPaths`: List of strings. Restricts filesystem access to specific paths.
- `canInvokeAI`: Boolean. If true, allows the plugin to call AI runtime tasks.
- `maxMemoryMB`: Integer. Hard limit for plugin heap.
- `maxCPUPatencyMs`: Integer. Maximum allowed execution time for a single hook.

### Resource Limits

- `cpuLimit`: Float (0.0 to 1.0). Percentage of a single CPU core allocated.
- `memoryLimit`: Integer. Total memory limit in MB.
