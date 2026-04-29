# Getting Started with SawyerCore SDK

Welcome to the SawyerCore developer platform. This SDK allows you to build plugins and external integrations for the Sawyer AI operating layer.

## Prerequisites
- Node.js 18+
- TypeScript 5.0+

## Installation
Currently, the SDK is available locally in the repository.

```bash
npm install ./sdk
```

## Creating Your First Plugin

1. Create a `manifest.json`:
```json
{
  "id": "com.example.hello-world",
  "name": "Hello World",
  "version": "1.0.0",
  "description": "A simple hello world plugin",
  "author": "Developer",
  "entryPoint": "index.js",
  "permissions": {
    "network": false,
    "filesystem": "NONE",
    "canInvokeAI": true,
    "maxMemoryMB": 128,
    "maxCPUPatencyMs": 100
  },
  "runtimeHooks": ["init"],
  "resourceLimits": {
    "cpuLimit": 0.5,
    "memoryLimit": 256
  }
}
```

2. Create `index.js`:
```javascript
const { SawyerPlugin } = require('./sdk/plugin');

SawyerPlugin.log("Hello from Sawyer Plugin!");

async function run() {
  const result = await SawyerPlugin.invokeTask('text-gen', { prompt: 'Hello' });
  SawyerPlugin.log(`Result: ${result.status}`);
}

run();
```

## Security Model
Plugins run in a isolated sandbox. They have NO access to:
- Filesystem (unless explicitly granted)
- Network (unless explicitly granted)
- Parent process globals
- Environment variables

Always check for `DEGRADED` states when invoking tasks, especially in offline mode.
