import { TenantIsolationController } from './controller.js';
import { TenantManager } from '../api/tenant-manager.js';
import { BillingController } from '../billing/controller.js';
export function tenantMiddleware(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        res.status(401).json({
            error: 'API key required',
            code: 'MISSING_API_KEY'
        });
        return;
    }
    const tenantManager = TenantManager.getInstance();
    const isolationController = TenantIsolationController.getInstance();
    const billingController = new BillingController();
    tenantManager
        .validateApiKey(apiKey)
        .then(async (apiKeyData) => {
        if (!apiKeyData) {
            res.status(401).json({
                error: 'Invalid API key',
                code: 'INVALID_API_KEY'
            });
            return;
        }
        if (apiKeyData.expiresAt && apiKeyData.expiresAt < new Date()) {
            res.status(401).json({
                error: 'API key expired',
                code: 'EXPIRED_API_KEY'
            });
            return;
        }
        const quota = await billingController.checkTenantQuota(apiKeyData.tenantId);
        if (!quota.canExecute) {
            res.status(429).json({
                error: 'Quota exceeded',
                code: 'QUOTA_EXCEEDED',
                details: quota.reason,
                usage: quota.currentUsage
            });
            return;
        }
        const tenant = await tenantManager.getTenant(apiKeyData.tenantId);
        if (!tenant) {
            res.status(404).json({
                error: 'Tenant not found',
                code: 'TENANT_NOT_FOUND'
            });
            return;
        }
        if (tenant.status === 'suspended') {
            res.status(403).json({
                error: 'Tenant suspended',
                code: 'TENANT_SUSPENDED'
            });
            return;
        }
        const context = await isolationController.createContext(tenant.id, apiKey, apiKeyData.scopes, tenant.resourceLimits);
        req.tenantContext = context;
        req.tenantId = context.tenantId;
        next();
    })
        .catch((error) => {
        res.status(500).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR',
            message: error.message
        });
    });
}
export function scopeMiddleware(requiredScopes) {
    return (req, res, next) => {
        const context = req.tenantContext;
        if (!context) {
            res.status(401).json({
                error: 'Tenant context missing',
                code: 'MISSING_CONTEXT'
            });
            return;
        }
        const hasAllScopes = requiredScopes.every(scope => context.scopes.includes(scope));
        if (!hasAllScopes) {
            res.status(403).json({
                error: 'Insufficient permissions',
                code: 'SCOPE_VIOLATION',
                required: requiredScopes,
                provided: context.scopes
            });
            return;
        }
        next();
    };
}
export async function enforceResourceIsolation(tenantId, resourceId) {
    const isolationController = TenantIsolationController.getInstance();
    return isolationController.enforceIsolation(tenantId, resourceId);
}
