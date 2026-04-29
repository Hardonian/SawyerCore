export class AutonomyContract {
    limits;
    constructor(limits) {
        this.limits = limits;
    }
    validateAction(action) {
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
    isScopeHigher(actionScope, limitScope) {
        const scopes = ['LOCAL', 'TENANT', 'SYSTEM'];
        return scopes.indexOf(actionScope) > scopes.indexOf(limitScope);
    }
    getLimits() {
        return { ...this.limits };
    }
}
