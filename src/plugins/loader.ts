import fs from 'fs';
import path from 'path';
import { PluginManifest, validateManifest } from './manifest.js';
import { PluginSandbox } from './sandbox.js';
import { PermissionManager } from './permissions.js';

export class PluginLoader {
  private plugins: Map<string, PluginManifest> = new Map();
  private sandbox = new PluginSandbox();
  private permissions = new PermissionManager();

  async loadFromDirectory(dir: string): Promise<PluginManifest[]> {
    if (!fs.existsSync(dir)) return [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const loaded: PluginManifest[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const manifestPath = path.join(dir, entry.name, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            if (validateManifest(manifest)) {
              await this.initializePlugin(path.join(dir, entry.name), manifest);
              loaded.push(manifest);
            }
          } catch (error) {
            console.error(`Failed to load plugin from ${entry.name}:`, error);
          }
        }
      }
    }

    return loaded;
  }

  private async initializePlugin(dir: string, manifest: PluginManifest) {
    const entryPath = path.join(dir, manifest.entryPoint);
    if (!fs.existsSync(entryPath)) {
      throw new Error(`Entry point ${manifest.entryPoint} not found for plugin ${manifest.id}`);
    }

    const code = fs.readFileSync(entryPath, 'utf-8');
    
    // Register permissions
    this.permissions.registerPlugin(manifest.id, manifest.permissions);

    // Create sandbox
    this.sandbox.createSandbox({
      id: manifest.id,
      manifest,
      globals: {
        // Define plugin-accessible APIs here
        SAWYER_API: {
          id: manifest.id,
          version: manifest.version,
          invokeTask: async (type: string, _payload: any) => {
            // Implementation of task invocation
            console.log(`Plugin ${manifest.id} invoking task ${type}`);
            return { status: 'DEGRADED', reason: 'Plugin SDK bridge initializing' };
          }
        }
      }
    });

    // Run initialization
    this.sandbox.run(manifest.id, code);
    this.plugins.set(manifest.id, manifest);
    console.log(`Plugin ${manifest.id} initialized successfully.`);
  }

  getPlugin(id: string): PluginManifest | undefined {
    return this.plugins.get(id);
  }

  listPlugins(): PluginManifest[] {
    return Array.from(this.plugins.values());
  }
}
