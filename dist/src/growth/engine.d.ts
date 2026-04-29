import { LandingPage, ABTest, Campaign, ViralLoop } from './types.js';
export declare class GrowthEngine {
    private static instance;
    static getInstance(): GrowthEngine;
    createLandingPage(data: {
        slug: string;
        title: string;
        content: string;
        metaDescription?: string;
        variant?: 'A' | 'B';
    }): Promise<LandingPage>;
    getLandingPage(id: string): Promise<LandingPage | null>;
    getLandingPageBySlug(slug: string): Promise<LandingPage | null>;
    updateLandingPage(id: string, updates: Partial<LandingPage>): Promise<LandingPage | null>;
    recordPageView(slug: string): Promise<void>;
    recordConversion(slug: string): Promise<void>;
    createABTest(data: {
        name: string;
        description?: string;
        variants: Array<{
            name: string;
            content: string;
            traffic: number;
        }>;
        endDate?: Date;
    }): Promise<ABTest>;
    assignVariant(testId: string, userId: string): Promise<string>;
    recordABTestConversion(testId: string, variantName: string): Promise<void>;
    getABTestResults(testId: string): Promise<ABTest['results']>;
    declareWinner(testId: string): Promise<ABTest | null>;
    getAllABTests(): Promise<ABTest[]>;
    createCampaign(data: {
        name: string;
        type: Campaign['type'];
        content: string;
        targetAudience?: string;
        scheduledAt?: Date;
    }): Promise<Campaign>;
    activateCampaign(id: string): Promise<Campaign | null>;
    recordCampaignMetrics(id: string, metrics: Partial<{
        sent: number;
        opened: number;
        clicked: number;
        converted: number;
    }>): Promise<Campaign | null>;
    getCampaigns(): Promise<Campaign[]>;
    createViralLoop(data: {
        type: ViralLoop['type'];
        trigger: string;
        reward: ViralLoop['reward'];
    }): Promise<ViralLoop>;
    triggerViralLoop(loopId: string): Promise<ViralLoop | null>;
    getViralLoops(): Promise<ViralLoop[]>;
    private hashString;
    clearAllData(): Promise<void>;
}
