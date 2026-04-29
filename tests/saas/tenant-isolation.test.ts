import { describe, it, expect, beforeEach } from 'vitest';
import { TenantManager } from '../../src/api/tenant-manager.js';
import { TenantIsolationController } from '../../src/tenancy/controller.js';

describe('Tenant Isolation', () => {
  let tenantManager: TenantManager;
  let isolationController: TenantIsolationController;

  beforeEach(async () => {
    tenantManager = TenantManager.getInstance();
    isolationController = TenantIsolationController.getInstance();
    await isolationController.clearAllContexts();
    await tenantManager.clearTenantData('tenant-a');
    await tenantManager.clearTenantData('tenant-b');
    await tenantManager.clearTenantData('tenant-c');
  });

  describe('API Key Validation', () => {
    it('generates unique API keys per tenant', async () => {
      await tenantManager.createTenant({
        id: 'tenant-a',
        name: 'Tenant A',
        email: 'a@test.com',
        plan: 'starter',
        resourceLimits: {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      });

      await tenantManager.createTenant({
        id: 'tenant-b',
        name: 'Tenant B',
        email: 'b@test.com',
        plan: 'pro',
        resourceLimits: {
          maxConcurrentTasks: 50,
          maxStorageBytes: 5_000_000_000,
          maxApiCallsPerMinute: 500,
          maxAgents: 20
        }
      });

      const { key: keyA } = await tenantManager.createApiKey('tenant-a', 'Key A', ['read']);
      const { key: keyB } = await tenantManager.createApiKey('tenant-b', 'Key B', ['read', 'write']);

      expect(keyA).not.toBe(keyB);
      expect(keyA.startsWith('sk_')).toBe(true);
      expect(keyB.startsWith('sk_')).toBe(true);
    });

    it('validates API key returns correct tenant', async () => {
      await tenantManager.createTenant({
        id: 'tenant-a',
        name: 'Tenant A',
        email: 'a@test.com',
        plan: 'starter',
        resourceLimits: {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      });

      const { key } = await tenantManager.createApiKey('tenant-a', 'Test Key', ['read']);
      const validated = await tenantManager.validateApiKey(key);

      expect(validated).not.toBeNull();
      expect(validated!.tenantId).toBe('tenant-a');
    });

    it('rejects invalid API keys', async () => {
      const validated = await tenantManager.validateApiKey('sk_invalid_key');
      expect(validated).toBeNull();
    });

    it('rejects expired API keys', async () => {
      await tenantManager.createTenant({
        id: 'tenant-a',
        name: 'Tenant A',
        email: 'a@test.com',
        plan: 'starter',
        resourceLimits: {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() - 1);

      const { key } = await tenantManager.createApiKey('tenant-a', 'Expired Key', ['read'], expiresAt);
      const validated = await tenantManager.validateApiKey(key);

      expect(validated).toBeNull();
    });

    it('revokes API keys correctly', async () => {
      await tenantManager.createTenant({
        id: 'tenant-a',
        name: 'Tenant A',
        email: 'a@test.com',
        plan: 'starter',
        resourceLimits: {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      });

      const { key, apiKey } = await tenantManager.createApiKey('tenant-a', 'To Revoke', ['read']);
      const validatedBefore = await tenantManager.validateApiKey(key);
      expect(validatedBefore).not.toBeNull();

      await tenantManager.revokeApiKey(apiKey.id);
      const validatedAfter = await tenantManager.validateApiKey(key);
      expect(validatedAfter).toBeNull();
    });
  });

  describe('Data Isolation', () => {
    it('prevents cross-tenant agent config access', async () => {
      await tenantManager.createTenant({
        id: 'tenant-a',
        name: 'Tenant A',
        email: 'a@test.com',
        plan: 'starter',
        resourceLimits: {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      });

      await tenantManager.createTenant({
        id: 'tenant-b',
        name: 'Tenant B',
        email: 'b@test.com',
        plan: 'pro',
        resourceLimits: {
          maxConcurrentTasks: 50,
          maxStorageBytes: 5_000_000_000,
          maxApiCallsPerMinute: 500,
          maxAgents: 20
        }
      });

      const agentA = await tenantManager.createAgentConfig({
        tenantId: 'tenant-a',
        name: 'Agent A',
        steps: [{ type: 'task', config: {} }],
        triggers: ['manual'],
        enabled: true
      });

      const agentsB = await tenantManager.listAgentConfigs('tenant-b');
      expect(agentsB).not.toContainEqual(agentA);
      expect(agentsB).toHaveLength(0);
    });

    it('isolates referral data between tenants', async () => {
      await tenantManager.createTenant({
        id: 'tenant-a',
        name: 'Tenant A',
        email: 'a@test.com',
        plan: 'starter',
        resourceLimits: {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      });

      await tenantManager.createTenant({
        id: 'tenant-b',
        name: 'Tenant B',
        email: 'b@test.com',
        plan: 'pro',
        resourceLimits: {
          maxConcurrentTasks: 50,
          maxStorageBytes: 5_000_000_000,
          maxApiCallsPerMinute: 500,
          maxAgents: 20
        }
      });

      await tenantManager.createReferral('tenant-a', 'ref@tenant-a.com');
      const referralsB = await tenantManager.getReferrals('tenant-b');

      expect(referralsB).toHaveLength(0);
    });

    it('clears all tenant data correctly', async () => {
      await tenantManager.createTenant({
        id: 'tenant-a',
        name: 'Tenant A',
        email: 'a@test.com',
        plan: 'starter',
        resourceLimits: {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      });

      await tenantManager.createApiKey('tenant-a', 'Key', ['read']);
      await tenantManager.createAgentConfig({
        tenantId: 'tenant-a',
        name: 'Agent',
        steps: [],
        triggers: ['manual'],
        enabled: true
      });

      await tenantManager.clearTenantData('tenant-a');

      const tenant = await tenantManager.getTenant('tenant-a');
      expect(tenant).toBeNull();
    });
  });

  describe('Resource Isolation', () => {
    it('enforces resource partitions', async () => {
      await isolationController.createContext(
        'tenant-a',
        'sk_a',
        ['read'],
        {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      );

      await isolationController.registerResource('tenant-a', 'resource-1');
      await isolationController.registerResource('tenant-a', 'resource-2');

      const hasAccess1 = await isolationController.enforceIsolation('tenant-a', 'resource-1');
      expect(hasAccess1).toBe(true);

      const hasAccess3 = await isolationController.enforceIsolation('tenant-a', 'resource-3');
      expect(hasAccess3).toBe(false);
    });

    it('prevents cross-tenant resource access', async () => {
      await isolationController.createContext(
        'tenant-a',
        'sk_a',
        ['read'],
        {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      );

      await isolationController.createContext(
        'tenant-b',
        'sk_b',
        ['read'],
        {
          maxConcurrentTasks: 50,
          maxStorageBytes: 5_000_000_000,
          maxApiCallsPerMinute: 500,
          maxAgents: 20
        }
      );

      await isolationController.registerResource('tenant-a', 'shared-resource');

      const tenantBAccess = await isolationController.enforceIsolation('tenant-b', 'shared-resource');
      expect(tenantBAccess).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('tracks requests per tenant', async () => {
      await isolationController.createContext(
        'tenant-a',
        'sk_a',
        ['read'],
        {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      );

      const context1 = await isolationController.validateContext('sk_a');
      expect(context1).not.toBeNull();
    });
  });

  describe('Tenant Context', () => {
    it('creates and validates tenant contexts', async () => {
      const context = await isolationController.createContext(
        'tenant-a',
        'sk_a',
        ['read', 'write'],
        {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      );

      expect(context.tenantId).toBe('tenant-a');
      expect(context.apiKey).toBe('sk_a');
      expect(context.scopes).toContain('read');
      expect(context.scopes).toContain('write');
    });

    it('revokes tenant contexts', async () => {
      await isolationController.createContext(
        'tenant-a',
        'sk_a',
        ['read'],
        {
          maxConcurrentTasks: 10,
          maxStorageBytes: 1_000_000_000,
          maxApiCallsPerMinute: 100,
          maxAgents: 5
        }
      );

      await isolationController.revokeContext('sk_a');
      const context = await isolationController.getTenantContext('sk_a');
      expect(context).toBeNull();
    });
  });
});
