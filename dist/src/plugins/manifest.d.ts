export interface PluginPermissions {
    network: boolean;
    filesystem: 'NONE' | 'READ' | 'READ_WRITE';
    allowedDomains?: string[];
    allowedPaths?: string[];
    canInvokeAI: boolean;
    maxMemoryMB: number;
    maxCPUPatencyMs: number;
}
export interface PluginManifest {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    entryPoint: string;
    permissions: PluginPermissions;
    runtimeHooks: string[];
    resourceLimits: {
        cpuLimit: number;
        memoryLimit: number;
    };
}
export declare function validateManifest(manifest: any): manifest is PluginManifest;
