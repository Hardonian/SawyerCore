import vm from 'vm';
import { PluginManifest } from './manifest.js';
export interface SandboxContext {
    id: string;
    manifest: PluginManifest;
    globals: Record<string, any>;
}
export declare class PluginSandbox {
    private contexts;
    createSandbox(config: SandboxContext): vm.Context;
    run(id: string, code: string): any;
    destroy(id: string): void;
}
