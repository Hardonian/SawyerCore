import { PluginManifest } from './manifest.js';
export declare class PluginLoader {
    private plugins;
    private sandbox;
    private permissions;
    loadFromDirectory(dir: string): Promise<PluginManifest[]>;
    private initializePlugin;
    getPlugin(id: string): PluginManifest | undefined;
    listPlugins(): PluginManifest[];
}
