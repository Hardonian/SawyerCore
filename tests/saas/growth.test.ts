import { describe, it, expect, beforeEach } from 'vitest';
import { GrowthEngine } from '../../src/growth/engine.js';

describe('Growth Engine', () => {
  let growth: GrowthEngine;

  beforeEach(async () => {
    growth = GrowthEngine.getInstance();
    await growth.clearAllData();
  });

  describe('Landing Pages', () => {
    it('creates landing pages with correct defaults', async () => {
      const page = await growth.createLandingPage({
        slug: 'test-page',
        title: 'Test Page',
        content: '<h1>Test</h1>'
      });

      expect(page.slug).toBe('test-page');
      expect(page.title).toBe('Test Page');
      expect(page.variant).toBe('A');
      expect(page.active).toBe(true);
      expect(page.views).toBe(0);
      expect(page.conversions).toBe(0);
    });

    it('tracks page views correctly', async () => {
      await growth.createLandingPage({
        slug: 'tracked-page',
        title: 'Tracked Page',
        content: '<h1>Tracked</h1>'
      });

      await growth.recordPageView('tracked-page');
      await growth.recordPageView('tracked-page');
      await growth.recordPageView('tracked-page');

      const page = await growth.getLandingPageBySlug('tracked-page');
      expect(page?.views).toBe(3);
    });

    it('tracks conversions correctly', async () => {
      await growth.createLandingPage({
        slug: 'conversion-page',
        title: 'Conversion Page',
        content: '<h1>Convert</h1>'
      });

      await growth.recordPageView('conversion-page');
      await growth.recordPageView('conversion-page');
      await growth.recordConversion('conversion-page');

      const page = await growth.getLandingPageBySlug('conversion-page');
      expect(page?.conversions).toBe(1);
      expect(page?.conversionRate).toBeCloseTo(50, 0);
    });

    it('returns null for inactive pages', async () => {
      const page = await growth.createLandingPage({
        slug: 'inactive-page',
        title: 'Inactive Page',
        content: '<h1>Inactive</h1>'
      });

      await growth.updateLandingPage(page.id, { active: false });
      const retrieved = await growth.getLandingPageBySlug('inactive-page');
      expect(retrieved).toBeNull();
    });
  });

  describe('A/B Testing', () => {
    it('creates A/B tests with multiple variants', async () => {
      const test = await growth.createABTest({
        name: 'Headline Test',
        variants: [
          { name: 'A', content: 'Original Headline', traffic: 50 },
          { name: 'B', content: 'New Headline', traffic: 50 }
        ]
      });

      expect(test.variants).toHaveLength(2);
      expect(test.active).toBe(true);
      expect(test.results).toBeDefined();
    });

    it('assigns variants deterministically based on user ID', async () => {
      const test = await growth.createABTest({
        name: 'Consistent Test',
        variants: [
          { name: 'A', content: 'Variant A', traffic: 50 },
          { name: 'B', content: 'Variant B', traffic: 50 }
        ]
      });

      const variant1 = await growth.assignVariant(test.id, 'user-123');
      const variant2 = await growth.assignVariant(test.id, 'user-123');

      expect(variant1).toBe(variant2);
    });

    it('tracks conversion rates per variant', async () => {
      const test = await growth.createABTest({
        name: 'Conversion Test',
        variants: [
          { name: 'A', content: 'Variant A', traffic: 50 },
          { name: 'B', content: 'Variant B', traffic: 50 }
        ]
      });

      await growth.assignVariant(test.id, 'user-1');
      await growth.assignVariant(test.id, 'user-2');
      await growth.assignVariant(test.id, 'user-3');

      await growth.recordABTestConversion(test.id, 'A');
      await growth.recordABTestConversion(test.id, 'A');

      const results = await growth.getABTestResults(test.id);
      expect(results?.A.conversions).toBe(2);
    });

    it('declares winner based on conversion rate', async () => {
      const test = await growth.createABTest({
        name: 'Winner Test',
        variants: [
          { name: 'A', content: 'Variant A', traffic: 50 },
          { name: 'B', content: 'Variant B', traffic: 50 }
        ]
      });

      await growth.assignVariant(test.id, 'user-1');
      await growth.assignVariant(test.id, 'user-2');
      await growth.assignVariant(test.id, 'user-3');
      await growth.assignVariant(test.id, 'user-4');

      await growth.recordABTestConversion(test.id, 'B');
      await growth.recordABTestConversion(test.id, 'B');
      await growth.recordABTestConversion(test.id, 'B');

      const completed = await growth.declareWinner(test.id);
      expect(completed?.winner).toBe('B');
      expect(completed?.active).toBe(false);
    });
  });

  describe('Viral Loops', () => {
    it('creates viral loops with reward structure', async () => {
      const loop = await growth.createViralLoop({
        type: 'referral',
        trigger: 'user signs up via referral link',
        reward: {
          type: 'credits',
          value: 100,
          forReferrer: true,
          forReferred: true
        }
      });

      expect(loop.type).toBe('referral');
      expect(loop.active).toBe(true);
      expect(loop.completions).toBe(0);
      expect(loop.reward.value).toBe(100);
    });

    it('tracks loop completions', async () => {
      const loop = await growth.createViralLoop({
        type: 'share_output',
        trigger: 'user shares output publicly',
        reward: {
          type: 'trial_extension',
          value: 7,
          forReferrer: true,
          forReferred: false
        }
      });

      await growth.triggerViralLoop(loop.id);
      await growth.triggerViralLoop(loop.id);
      await growth.triggerViralLoop(loop.id);

      const updated = await growth.getViralLoops();
      expect(updated[0].completions).toBe(3);
    });

    it('only triggers active loops', async () => {
      const loop = await growth.createViralLoop({
        type: 'embed_widget',
        trigger: 'user embeds widget on their site',
        reward: {
          type: 'discount',
          value: 10,
          forReferrer: true,
          forReferred: false
        }
      });

      await growth.triggerViralLoop(loop.id);
    });
  });

  describe('Campaigns', () => {
    it('creates campaigns in draft state', async () => {
      const campaign = await growth.createCampaign({
        name: 'Welcome Email',
        type: 'email',
        content: 'Welcome to SawyerCore!',
        targetAudience: 'new users'
      });

      expect(campaign.status).toBe('draft');
      expect(campaign.type).toBe('email');
      expect(campaign.metrics).toBeDefined();
    });

    it('activates campaigns correctly', async () => {
      const campaign = await growth.createCampaign({
        name: 'Launch Campaign',
        type: 'social',
        content: 'Check out SawyerCore!'
      });

      const activated = await growth.activateCampaign(campaign.id);
      expect(activated?.status).toBe('active');
    });

    it('tracks campaign metrics', async () => {
      const campaign = await growth.createCampaign({
        name: 'Metrics Campaign',
        type: 'email',
        content: 'Track this!'
      });

      await growth.activateCampaign(campaign.id);
      await growth.recordCampaignMetrics(campaign.id, {
        sent: 1000,
        opened: 500,
        clicked: 200,
        converted: 50
      });

      const campaigns = await growth.getCampaigns();
      expect(campaigns[0].metrics?.sent).toBe(1000);
      expect(campaigns[0].metrics?.opened).toBe(500);
      expect(campaigns[0].metrics?.clicked).toBe(200);
      expect(campaigns[0].metrics?.converted).toBe(50);
    });
  });
});
