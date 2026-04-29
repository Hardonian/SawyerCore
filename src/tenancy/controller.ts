import { randomUUID } from 'crypto';
import { TenantContext, RateLimitConfig } from './types.js';

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export class TenantIsolationController {
  private static instance: TenantIsolationController;
  private activeContexts = new Map<string, TenantContext>();
  private tenantDataPartitions = new Map<string, Set<string>>();
  private defaultRateLimits: RateLimitConfig = {
    windowMs: 60000,
    maxRequests: 100
  };

  static getInstance(): TenantIsolationController {
    if (!TenantIsolationController.instance) {
      TenantIsolationController.instance = new TenantIsolationController();
    }
    return TenantIsolationController.instance;
  }

  async createContext(
    tenantId: string,
    apiKey: string,
    scopes: string[],
    resourceLimits: {
      maxConcurrentTasks: number;
      maxStorageBytes: number;
      maxApiCallsPerMinute: number;
      maxAgents: number;
    }
  ): Promise<TenantContext> {
    const context: TenantContext = {
      tenantId,
      apiKey,
      requestId: randomUUID(),
      timestamp: new Date(),
      scopes,
      resourceLimits
    };

    this.activeContexts.set(apiKey, context);
    
    if (!this.tenantDataPartitions.has(tenantId)) {
      this.tenantDataPartitions.set(tenantId, new Set());
    }

    return context;
  }

  async validateContext(apiKey: string): Promise<TenantContext | null> {
    const context = this.activeContexts.get(apiKey);
    if (!context) return null;

    if (!this.checkRateLimit(context.tenantId)) {
      return null;
    }

    this.recordRequest(context.tenantId);
    return context;
  }

  async enforceIsolation(requestingTenantId: string, targetResourceId: string): Promise<boolean> {
    const partition = this.tenantDataPartitions.get(requestingTenantId);
    if (!partition) return false;
    
    return partition.has(targetResourceId);
  }

  async registerResource(tenantId: string, resourceId: string): Promise<void> {
    let partition = this.tenantDataPartitions.get(tenantId);
    if (!partition) {
      partition = new Set();
      this.tenantDataPartitions.set(tenantId, partition);
    }
    partition.add(resourceId);
  }

  async removeResource(tenantId: string, resourceId: string): Promise<void> {
    const partition = this.tenantDataPartitions.get(tenantId);
    if (partition) {
      partition.delete(resourceId);
    }
  }

  async revokeContext(apiKey: string): Promise<void> {
    this.activeContexts.delete(apiKey);
  }

  private checkRateLimit(tenantId: string): boolean {
    const now = Date.now();
    const limit = this.defaultRateLimits;
    const key = tenantId;
    
    const record = rateLimitStore.get(key);
    if (!record) return true;

    if (now > record.resetAt) {
      return true;
    }

    return record.count < limit.maxRequests;
  }

  private recordRequest(tenantId: string): void {
    const now = Date.now();
    const limit = this.defaultRateLimits;
    const key = tenantId;
    
    const record = rateLimitStore.get(key);
    if (!record || now > record.resetAt) {
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + limit.windowMs
      });
    } else {
      record.count++;
    }
  }

  async getTenantContext(apiKey: string): Promise<TenantContext | null> {
    return this.activeContexts.get(apiKey) ?? null;
  }

  async clearAllContexts(): Promise<void> {
    this.activeContexts.clear();
    this.tenantDataPartitions.clear();
    rateLimitStore.clear();
  }

  async getTenantResources(tenantId: string): Promise<Set<string>> {
    return this.tenantDataPartitions.get(tenantId) ?? new Set();
  }
}
