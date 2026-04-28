import { describe, it, expect } from 'vitest';
import { buildPreloadPlan } from '../../src/runtime/preload-planner.js';

describe('preload planner', () => {
  it('degrades startup preloads on low battery', () => {
    const plan = buildPreloadPlan({
      profile: 'mobile-edge',
      availableMemoryGb: 32,
      batteryPercent: 15,
      recentUsage: {},
      taskPriorities: ['chat', 'code', 'embeddings']
    });
    expect(plan.startup).toEqual(['chat']);
    expect(plan.mobileSync.length).toBeGreaterThan(0);
  });
});
