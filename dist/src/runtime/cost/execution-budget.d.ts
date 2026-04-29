/**
 * EXECUTION BUDGET
 * Tracks per-tenant and per-task budget consumption across the system.
 *
 * Enforces:
 * - Total spend per task respects maxBudgetUsd
 * - Cumulative spend per tenant within billing period
 * - Budget exhaustion triggers degraded modes, not crashes
 *
 * Budgets are loaded from config (tenant pricing tier) and task-level limits.
 */
import type { AiTask } from '../../types/contracts.js';
export interface BudgetState {
    tenantId: string;
    taskId: string;
    maxBudgetUsd: number;
    spentUsd: number;
    remainingUsd: number;
    exhausted: boolean;
}
export declare class ExecutionBudgetTracker {
    private taskBudgets;
    private tenantBudgets;
    private readonly minBudgetUsd;
    /**
     * Allocate budget for a new task.
     * If task.maxBudgetUsd is 0, treat as unlimited (unlimited budget tasks).
     */
    allocate(task: AiTask): BudgetState;
    /**
     * Track tenant-level budget constraints
     */
    setTenantBudget(tenantId: string, monthlyCapUsd: number): void;
    /**
     * Record cost after inference completes.
     * Returns true if budget still available, false if exhausted.
     */
    recordSpend(taskId: string, costUsd: number): {
        accepted: boolean;
        remainingUsd: number;
        exhausted: boolean;
    };
    /**
     * Check if task can proceed without exceeding budget
     */
    canProceed(taskId: string, projectedCostUsd: number): boolean;
    /**
     * Get current state for a task
     */
    getState(taskId: string): BudgetState | undefined;
    /**
     * Check tenant tier limits
     */
    getTenantRemaining(tenantId: string): number;
    /**
     * Clear budget for completed or cancelled task
     */
    clear(taskId: string): void;
    /**
     * Reset all budgets (for testing or billing cycle)
     */
    reset(): void;
}
export declare const budgetTracker: ExecutionBudgetTracker;
