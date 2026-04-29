import { randomUUID } from 'crypto';
import { LandingPage, ABTest, Campaign, ViralLoop } from './types.js';

const landingPages = new Map<string, LandingPage>();
const abTests = new Map<string, ABTest>();
const campaigns = new Map<string, Campaign>();
const viralLoops = new Map<string, ViralLoop>();

const pageViews = new Map<string, number>();
const pageConversions = new Map<string, number>();
const abTestAssignments = new Map<string, string>();

export class GrowthEngine {
  private static instance: GrowthEngine;

  static getInstance(): GrowthEngine {
    if (!GrowthEngine.instance) {
      GrowthEngine.instance = new GrowthEngine();
    }
    return GrowthEngine.instance;
  }

  async createLandingPage(data: {
    slug: string;
    title: string;
    content: string;
    metaDescription?: string;
    variant?: 'A' | 'B';
  }): Promise<LandingPage> {
    const page: LandingPage = {
      id: randomUUID(),
      slug: data.slug,
      title: data.title,
      content: data.content,
      metaDescription: data.metaDescription,
      variant: data.variant ?? 'A',
      active: true,
      createdAt: new Date(),
      conversions: 0,
      views: 0
    };

    landingPages.set(page.id, page);
    pageViews.set(page.id, 0);
    pageConversions.set(page.id, 0);
    return page;
  }

  async getLandingPage(id: string): Promise<LandingPage | null> {
    return landingPages.get(id) ?? null;
  }

  async getLandingPageBySlug(slug: string): Promise<LandingPage | null> {
    return Array.from(landingPages.values()).find(p => p.slug === slug && p.active) ?? null;
  }

  async updateLandingPage(id: string, updates: Partial<LandingPage>): Promise<LandingPage | null> {
    const page = landingPages.get(id);
    if (!page) return null;
    const updated = { ...page, ...updates };
    landingPages.set(id, updated);
    return updated;
  }

  async recordPageView(slug: string): Promise<void> {
    const page = Array.from(landingPages.values()).find(p => p.slug === slug);
    if (!page) return;
    
    const views = pageViews.get(page.id) ?? 0;
    pageViews.set(page.id, views + 1);
    page.views = views + 1;
    page.conversionRate = page.views > 0 ? (page.conversions / page.views) * 100 : 0;
    landingPages.set(page.id, page);
  }

  async recordConversion(slug: string): Promise<void> {
    const page = Array.from(landingPages.values()).find(p => p.slug === slug);
    if (!page) return;
    
    const conversions = pageConversions.get(page.id) ?? 0;
    pageConversions.set(page.id, conversions + 1);
    page.conversions = conversions + 1;
    page.conversionRate = page.views > 0 ? (page.conversions / page.views) * 100 : 0;
    landingPages.set(page.id, page);
  }

  async createABTest(data: {
    name: string;
    description?: string;
    variants: Array<{ name: string; content: string; traffic: number }>;
    endDate?: Date;
  }): Promise<ABTest> {
    const test: ABTest = {
      id: randomUUID(),
      name: data.name,
      description: data.description,
      startDate: new Date(),
      endDate: data.endDate,
      variants: data.variants,
      active: true,
      results: {}
    };

    for (const variant of data.variants) {
      if (test.results) {
        test.results[variant.name] = { views: 0, conversions: 0, conversionRate: 0 };
      }
    }

    abTests.set(test.id, test);
    return test;
  }

  async assignVariant(testId: string, userId: string): Promise<string> {
    const cacheKey = `${testId}:${userId}`;
    if (abTestAssignments.has(cacheKey)) {
      return abTestAssignments.get(cacheKey)!;
    }

    const test = abTests.get(testId);
    if (!test || !test.active) {
      return 'control';
    }

    const hash = this.hashString(userId + testId);
    let cumulativeTraffic = 0;
    
    for (const variant of test.variants) {
      cumulativeTraffic += variant.traffic;
      if (hash < cumulativeTraffic) {
        abTestAssignments.set(cacheKey, variant.name);
        
        if (test.results && test.results[variant.name]) {
          test.results[variant.name].views++;
          test.results[variant.name].conversionRate =
            test.results[variant.name].views > 0
              ? (test.results[variant.name].conversions / test.results[variant.name].views) * 100
              : 0;
        }
        
        abTests.set(testId, test);
        return variant.name;
      }
    }

    const defaultVariant = test.variants[0].name;
    abTestAssignments.set(cacheKey, defaultVariant);
    return defaultVariant;
  }

  async recordABTestConversion(testId: string, variantName: string): Promise<void> {
    const test = abTests.get(testId);
    if (!test?.results?.[variantName]) return;
    
    test.results[variantName].conversions++;
    test.results[variantName].conversionRate =
      test.results[variantName].views > 0
        ? (test.results[variantName].conversions / test.results[variantName].views) * 100
        : 0;
    abTests.set(testId, test);
  }

  async getABTestResults(testId: string): Promise<ABTest['results']> {
    const test = abTests.get(testId);
    return test?.results ?? {};
  }

  async declareWinner(testId: string): Promise<ABTest | null> {
    const test = abTests.get(testId);
    if (!test?.results) return null;

    let bestVariant = '';
    let bestRate = 0;

    for (const [name, stats] of Object.entries(test.results)) {
      if (stats.conversionRate > bestRate) {
        bestRate = stats.conversionRate;
        bestVariant = name;
      }
    }

    test.winner = bestVariant;
    test.active = false;
    abTests.set(testId, test);
    return test;
  }

  async getAllABTests(): Promise<ABTest[]> {
    return Array.from(abTests.values());
  }

  async createCampaign(data: {
    name: string;
    type: Campaign['type'];
    content: string;
    targetAudience?: string;
    scheduledAt?: Date;
  }): Promise<Campaign> {
    const campaign: Campaign = {
      id: randomUUID(),
      name: data.name,
      type: data.type,
      status: 'draft',
      targetAudience: data.targetAudience,
      content: data.content,
      scheduledAt: data.scheduledAt,
      metrics: { sent: 0, opened: 0, clicked: 0, converted: 0 }
    };

    campaigns.set(campaign.id, campaign);
    return campaign;
  }

  async activateCampaign(id: string): Promise<Campaign | null> {
    const campaign = campaigns.get(id);
    if (!campaign) return null;
    campaign.status = 'active';
    campaigns.set(id, campaign);
    return campaign;
  }

  async recordCampaignMetrics(
    id: string,
    metrics: Partial<{ sent: number; opened: number; clicked: number; converted: number }>
  ): Promise<Campaign | null> {
    const campaign = campaigns.get(id);
    if (!campaign?.metrics) return null;
    
    campaign.metrics = {
      ...campaign.metrics,
      ...metrics
    };
    campaigns.set(id, campaign);
    return campaign;
  }

  async getCampaigns(): Promise<Campaign[]> {
    return Array.from(campaigns.values());
  }

  async createViralLoop(data: {
    type: ViralLoop['type'];
    trigger: string;
    reward: ViralLoop['reward'];
  }): Promise<ViralLoop> {
    const loop: ViralLoop = {
      id: randomUUID(),
      type: data.type,
      trigger: data.trigger,
      reward: data.reward,
      active: true,
      completions: 0
    };

    viralLoops.set(loop.id, loop);
    return loop;
  }

  async triggerViralLoop(loopId: string): Promise<ViralLoop | null> {
    const loop = viralLoops.get(loopId);
    if (!loop?.active) return null;
    
    loop.completions++;
    viralLoops.set(loopId, loop);
    return loop;
  }

  async getViralLoops(): Promise<ViralLoop[]> {
    return Array.from(viralLoops.values());
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % 100;
  }

  async clearAllData(): Promise<void> {
    landingPages.clear();
    abTests.clear();
    campaigns.clear();
    viralLoops.clear();
    pageViews.clear();
    pageConversions.clear();
    abTestAssignments.clear();
  }
}
