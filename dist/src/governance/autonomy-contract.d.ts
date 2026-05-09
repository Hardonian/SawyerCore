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
export declare class AutonomyContract {
    private limits;
    constructor(limits: AutonomyLimits);
    validateAction(action: AutonomousAction): {
        allowed: boolean;
        reason?: string;
    };
    private isScopeHigher;
    getLimits(): AutonomyLimits;
}
