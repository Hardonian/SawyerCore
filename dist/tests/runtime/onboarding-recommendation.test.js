import { describe, it, expect } from 'vitest';
import { recommendProfile } from '../../src/runtime/onboarding.js';
import { generateDeterministicRecommendation, maybeGenerateAiExplanation } from '../../src/runtime/recommendation-engine.js';
describe('onboarding and recommendations', () => {
    const inventory = {
        deviceType: 'android-phone',
        os: 'Android',
        cpuCores: 8,
        ramGb: 8,
        hasGpu: false,
        vramGb: 0,
        hasNpu: true,
        batterySensitive: true,
        thermalSensitive: true,
        privacyPreference: 'strict',
        budgetPreference: 'low',
        speedVsQuality: 'speed',
        mode: 'local-first'
    };
    it('selects correct profile deterministically', () => {
        expect(recommendProfile(inventory)).toBe('mobile-edge');
        const rec = generateDeterministicRecommendation(inventory);
        expect(rec.profile).toBe('mobile-edge');
    });
    it('ai recommendation toggle disabled by default', () => {
        const base = generateDeterministicRecommendation(inventory);
        const out = maybeGenerateAiExplanation(base, false);
        expect(out.explanation).toBe(base.explanation);
    });
});
