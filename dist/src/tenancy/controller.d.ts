import { TenantContext } from './types.js';
export declare class TenantIsolationController {
    private static instance;
    private activeContexts;
    private tenantDataPartitions;
    private defaultRateLimits;
    static getInstance(): TenantIsolationController;
    createContext(tenantId: string, apiKey: string, scopes: string[], resourceLimits: {
        maxConcurrentTasks: number;
        maxStorageBytes: number;
        maxApiCallsPerMinute: number;
        maxAgents: number;
    }): Promise<TenantContext>;
    validateContext(apiKey: string): Promise<TenantContext | null>;
    enforceIsolation(requestingTenantId: string, targetResourceId: string): Promise<boolean>;
    registerResource(tenantId: string, resourceId: string): Promise<void>;
    removeResource(tenantId: string, resourceId: string): Promise<void>;
    revokeContext(apiKey: string): Promise<void>;
    private checkRateLimit;
    private recordRequest;
    getTenantContext(apiKey: string): Promise<TenantContext | null>;
    clearAllContexts(): Promise<void>;
    getTenantResources(tenantId: string): Promise<Set<string>>;
}
