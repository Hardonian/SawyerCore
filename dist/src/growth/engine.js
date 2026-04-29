import { randomUUID } from 'crypto';
const landingPages = new Map();
const abTests = new Map();
const campaigns = new Map();
const viralLoops = new Map();
const pageViews = new Map();
const pageConversions = new Map();
const abTestAssignments = new Map();
export class GrowthEngine {
    static instance;
    static getInstance() {
        if (!GrowthEngine.instance) {
            GrowthEngine.instance = new GrowthEngine();
        }
        return GrowthEngine.instance;
    }
    async createLandingPage(data) {
        const page = {
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
    async getLandingPage(id) {
        return landingPages.get(id) ?? null;
    }
    async getLandingPageBySlug(slug) {
        return Array.from(landingPages.values()).find(p => p.slug === slug && p.active) ?? null;
    }
    async updateLandingPage(id, updates) {
        const page = landingPages.get(id);
        if (!page)
            return null;
        const updated = { ...page, ...updates };
        landingPages.set(id, updated);
        return updated;
    }
    async recordPageView(slug) {
        let page;
        for (const p of landingPages.values()) {
            if (p.slug === slug) {
                page = p;
                break;
            }
        }
        if (!page)
            return;
        const views = pageViews.get(page.id) ?? 0;
        pageViews.set(page.id, views + 1);
        page.views = views + 1;
        page.conversionRate = page.views > 0 ? (page.conversions / page.views) * 100 : 0;
        landingPages.set(page.id, page);
    }
    async recordConversion(slug) {
        let page;
        for (const p of landingPages.values()) {
            if (p.slug === slug) {
                page = p;
                break;
            }
        }
        if (!page)
            return;
        const conversions = pageConversions.get(page.id) ?? 0;
        pageConversions.set(page.id, conversions + 1);
        page.conversions = conversions + 1;
        page.conversionRate = page.views > 0 ? (page.conversions / page.views) * 100 : 0;
        landingPages.set(page.id, page);
    }
    async createABTest(data) {
        const test = {
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
    async assignVariant(testId, userId) {
        const cacheKey = `${testId}:${userId}`;
        if (abTestAssignments.has(cacheKey)) {
            return abTestAssignments.get(cacheKey);
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
    async recordABTestConversion(testId, variantName) {
        const test = abTests.get(testId);
        if (!test?.results?.[variantName])
            return;
        test.results[variantName].conversions++;
        test.results[variantName].conversionRate =
            test.results[variantName].views > 0
                ? (test.results[variantName].conversions / test.results[variantName].views) * 100
                : 0;
        abTests.set(testId, test);
    }
    async getABTestResults(testId) {
        const test = abTests.get(testId);
        return test?.results ?? {};
    }
    async declareWinner(testId) {
        const test = abTests.get(testId);
        if (!test?.results)
            return null;
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
    async getAllABTests() {
        return Array.from(abTests.values());
    }
    async createCampaign(data) {
        const campaign = {
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
    async activateCampaign(id) {
        const campaign = campaigns.get(id);
        if (!campaign)
            return null;
        campaign.status = 'active';
        campaigns.set(id, campaign);
        return campaign;
    }
    async recordCampaignMetrics(id, metrics) {
        const campaign = campaigns.get(id);
        if (!campaign?.metrics)
            return null;
        campaign.metrics = {
            ...campaign.metrics,
            ...metrics
        };
        campaigns.set(id, campaign);
        return campaign;
    }
    async getCampaigns() {
        return Array.from(campaigns.values());
    }
    async createViralLoop(data) {
        const loop = {
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
    async triggerViralLoop(loopId) {
        const loop = viralLoops.get(loopId);
        if (!loop?.active)
            return null;
        loop.completions++;
        viralLoops.set(loopId, loop);
        return loop;
    }
    async getViralLoops() {
        return Array.from(viralLoops.values());
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash) % 100;
    }
    async clearAllData() {
        landingPages.clear();
        abTests.clear();
        campaigns.clear();
        viralLoops.clear();
        pageViews.clear();
        pageConversions.clear();
        abTestAssignments.clear();
    }
}
