export class PermissionManager {
    activePermissions = new Map();
    registerPlugin(id, permissions) {
        this.activePermissions.set(id, permissions);
    }
    checkPermission(id, capability) {
        const permissions = this.activePermissions.get(id);
        if (!permissions)
            return false;
        const value = permissions[capability];
        if (typeof value === 'boolean')
            return value;
        if (typeof value === 'string')
            return value !== 'NONE';
        return false;
    }
    canAccessPath(id, path) {
        const permissions = this.activePermissions.get(id);
        if (!permissions || permissions.filesystem === 'NONE')
            return false;
        if (!permissions.allowedPaths)
            return false;
        return permissions.allowedPaths.some(p => path.startsWith(p));
    }
    canAccessDomain(id, domain) {
        const permissions = this.activePermissions.get(id);
        if (!permissions || !permissions.network)
            return false;
        if (!permissions.allowedDomains)
            return false;
        return permissions.allowedDomains.includes(domain);
    }
}
