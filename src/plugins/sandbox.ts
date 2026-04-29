import vm from 'vm';
import { PluginManifest } from './manifest.js';

export interface SandboxContext {
  id: string;
  manifest: PluginManifest;
  globals: Record<string, any>;
}

export class PluginSandbox {
  private contexts: Map<string, vm.Context> = new Map();

  createSandbox(config: SandboxContext): vm.Context {
    const sandbox = {
      console: {
        log: (...args: any[]) => console.log(`[Plugin:${config.id}]`, ...args),
        error: (...args: any[]) => console.error(`[Plugin:${config.id}]`, ...args),
      },
      // Controlled access to AI capabilities would be passed here
      ...config.globals,
      process: {
        uptime: () => process.uptime(),
      },
    };

    const context = vm.createContext(sandbox);
    this.contexts.set(config.id, context);
    return context;
  }

  run(id: string, code: string): any {
    const context = this.contexts.get(id);
    if (!context) throw new Error(`No sandbox context for plugin ${id}`);
    
    const script = new vm.Script(code);
    return script.runInContext(context, {
      timeout: 1000, // Hard timeout for plugin execution
    });
  }

  destroy(id: string) {
    this.contexts.delete(id);
  }
}
