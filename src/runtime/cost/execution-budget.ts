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

interface TenantBudget {
  tenantId: string;
  monthlyCapUsd: number;
  usedThisPeriodUsd: number;
  periodStart: Date;
}

export class ExecutionBudgetTracker {
  private taskBudgets: Map<string, BudgetState> = new Map();
  private tenantBudgets: Map<string, TenantBudget> = new Map();
  private readonly minBudgetUsd = 0.0001; // minimum non-zero

  /**
   * Allocate budget for a new task.
   * If task.maxBudgetUsd is 0, treat as unlimited (unlimited budget tasks).
   */
  allocate(task: AiTask): BudgetState {
    const state: BudgetState = {
      tenantId: '', // Will be set by caller after allocation
      taskId: task.id,
      maxBudgetUsd: task.maxBudgetUsd || Infinity,
      spentUsd: 0,
      remainingUsd: task.maxBudgetUsd || Infinity,
      exhausted: false
    };
    this.taskBudgets.set(task.id, state);
    return state;
  }

  /**
   * Track tenant-level budget constraints
   */
  setTenantBudget(tenantId: string, monthlyCapUsd: number): void {
    this.tenantBudgets.set(tenantId, {
      tenantId,
      monthlyCapUsd,
      usedThisPeriodUsd: 0,
      periodStart: new Date()
    });
  }

  /**
   * Record cost after inference completes.
   * Returns true if budget still available, false if exhausted.
   */
  recordSpend(taskId: string, costUsd: number): { accepted: boolean; remainingUsd: number; exhausted: boolean } {
    const state = this.taskBudgets.get(taskId);
    if (!state) {
      return { accepted: false, remainingUsd: 0, exhausted: true };
    }

    if (state.exhausted) {
      return { accepted: false, remainingUsd: 0, exhausted: true };
    }

    const newSpent = state.spentUsd + costUsd;
    const remaining = Math.max(0, state.maxBudgetUsd - newSpent);

    state.spentUsd = newSpent;
    state.remainingUsd = remaining;
    state.exhausted = remaining < this.minBudgetUsd;

    // Also update tenant budget if known
    const tenantBud = this.tenantBudgets.get(state.tenantId);
    if (tenantBud) {
      tenantBud.usedThisPeriodUsd += costUsd;
    }

    return {
      accepted: !state.exhausted,
      remainingUsd: remaining,
      exhausted: state.exhausted
    };
  }

  /**
   * Check if task can proceed without exceeding budget
   */
  canProceed(taskId: string, projectedCostUsd: number): boolean {
    const state = this.taskBudgets.get(taskId);
    if (!state) return false;
    if (state.exhausted) return false;
    return (state.spentUsd + projectedCostUsd) <= state.maxBudgetUsd;
  }

  /**
   * Get current state for a task
   */
  getState(taskId: string): BudgetState | undefined {
    return this.taskBudgets.get(taskId);
  }

  /**
   * Check tenant tier limits
   */
  getTenantRemaining(tenantId: string): number {
    const tenant = this.tenantBudgets.get(tenantId);
    if (!tenant) return Infinity;
    return Math.max(0, tenant.monthlyCapUsd - tenant.usedThisPeriodUsd);
  }

  /**
   * Clear budget for completed or cancelled task
   */
  clear(taskId: string): void {
    this.taskBudgets.delete(taskId);
  }

  /**
   * Reset all budgets (for testing or billing cycle)
   */
  reset(): void {
    this.taskBudgets.clear();
    this.tenantBudgets.clear();
  }
}

// Singleton instance for system-wide use
export const budgetTracker = new ExecutionBudgetTracker();
