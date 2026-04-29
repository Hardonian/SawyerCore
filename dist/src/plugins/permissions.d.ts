import { PluginPermissions } from './manifest.js';
export declare class PermissionManager {
    private activePermissions;
    registerPlugin(id: string, permissions: PluginPermissions): void;
    checkPermission(id: string, capability: keyof PluginPermissions): boolean;
    canAccessPath(id: string, path: string): boolean;
    canAccessDomain(id: string, domain: string): boolean;
}
