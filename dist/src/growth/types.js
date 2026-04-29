import { z } from 'zod';
export const LandingPageSchema = z.object({
    id: z.string().uuid(),
    slug: z.string(),
    title: z.string(),
    content: z.string(),
    metaDescription: z.string().optional(),
    variant: z.enum(['A', 'B']).optional(),
    active: z.boolean(),
    createdAt: z.date(),
    conversions: z.number(),
    views: z.number(),
    conversionRate: z.number().optional()
});
export const ABTestSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().optional(),
    startDate: z.date(),
    endDate: z.date().optional(),
    variants: z.array(z.object({
        name: z.string(),
        content: z.string(),
        traffic: z.number()
    })),
    winner: z.string().optional(),
    active: z.boolean(),
    results: z.record(z.object({
        views: z.number(),
        conversions: z.number(),
        conversionRate: z.number()
    })).optional()
});
export const CampaignSchema = z.object({
    id: z.string().uuid(),
    name: z.string(),
    type: z.enum(['email', 'social', 'referral', 'content']),
    status: z.enum(['draft', 'active', 'paused', 'completed']),
    targetAudience: z.string().optional(),
    content: z.string(),
    scheduledAt: z.date().optional(),
    sentAt: z.date().optional(),
    metrics: z.object({
        sent: z.number(),
        opened: z.number(),
        clicked: z.number(),
        converted: z.number()
    }).optional()
});
export const ViralLoopSchema = z.object({
    id: z.string().uuid(),
    type: z.enum(['referral', 'share_output', 'embed_widget', 'api_integration']),
    trigger: z.string(),
    reward: z.object({
        type: z.enum(['credits', 'discount', 'feature_unlock', 'trial_extension']),
        value: z.number(),
        forReferrer: z.boolean(),
        forReferred: z.boolean()
    }),
    active: z.boolean(),
    completions: z.number()
});
