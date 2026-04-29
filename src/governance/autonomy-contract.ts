export interface AutonomyLimits {
  maxSpendUSD: number;
  maxCPUUsage: number;
  maxMemoryMB: number;
  maxNetworkCalls: number;
  allowedPluginPermissions: string[];
  maxActionScope: 'LOCAL' | 'TENANT' | 'SYSTEM';
}

export interface AutonomousAction {
  id: string;
  reason: string;
  scope: 'LOCAL' | 'TENANT' | 'SYSTEM';
  expectedCostUSD: number;
  rollbackPath: string;
  requiresApproval: boolean;
}

export class AutonomyContract {
  constructor(private limits: AutonomyLimits) {}

  validateAction(action: AutonomousAction): { allowed: boolean; reason?: string } {
    if (action.expectedCostUSD > this.limits.maxSpendUSD) {
      return { allowed: false, reason: 'Exceeds maximum spend limit' };
    }

    if (this.isScopeHigher(action.scope, this.limits.maxActionScope)) {
      return { allowed: false, reason: `Action scope ${action.scope} exceeds allowed scope ${this.limits.maxActionScope}` };
    }

    if (action.requiresApproval) {
      return { allowed: false, reason: 'Action requires explicit operator approval' };
    }

    return { allowed: true };
  }

  private isScopeHigher(actionScope: string, limitScope: string): boolean {
    const scopes = ['LOCAL', 'TENANT', 'SYSTEM'];
    return scopes.indexOf(actionScope) > scopes.indexOf(limitScope);
  }

  getLimits(): AutonomyLimits {
    return { ...this.limits };
  }
}
