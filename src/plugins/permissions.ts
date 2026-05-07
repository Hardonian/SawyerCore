import { PluginPermissions } from './manifest.js';

export class PermissionManager {
  private activePermissions: Map<string, PluginPermissions> = new Map();

  registerPlugin(id: string, permissions: PluginPermissions) {
    this.activePermissions.set(id, permissions);
  }

  checkPermission(id: string, capability: keyof PluginPermissions): boolean {
    const permissions = this.activePermissions.get(id);
    if (!permissions) return false;
    
    const value = permissions[capability];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value !== 'NONE';
    
    return false;
  }

  canAccessPath(id: string, path: string): boolean {
    const permissions = this.activePermissions.get(id);
    if (!permissions || permissions.filesystem === 'NONE') return false;
    if (!permissions.allowedPaths) return false;
    return permissions.allowedPaths.some(p => path.startsWith(p));
  }

  canAccessDomain(id: string, domain: string): boolean {
    const permissions = this.activePermissions.get(id);
    if (!permissions || !permissions.network) return false;
    if (!permissions.allowedDomains) return false;
    return permissions.allowedDomains.includes(domain);
  }
}
