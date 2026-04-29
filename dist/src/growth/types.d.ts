import { z } from 'zod';
export declare const LandingPageSchema: z.ZodObject<{
    id: z.ZodString;
    slug: z.ZodString;
    title: z.ZodString;
    content: z.ZodString;
    metaDescription: z.ZodOptional<z.ZodString>;
    variant: z.ZodOptional<z.ZodEnum<["A", "B"]>>;
    active: z.ZodBoolean;
    createdAt: z.ZodDate;
    conversions: z.ZodNumber;
    views: z.ZodNumber;
    conversionRate: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    title: string;
    content: string;
    views: number;
    active: boolean;
    slug: string;
    conversions: number;
    metaDescription?: string | undefined;
    variant?: "A" | "B" | undefined;
    conversionRate?: number | undefined;
}, {
    id: string;
    createdAt: Date;
    title: string;
    content: string;
    views: number;
    active: boolean;
    slug: string;
    conversions: number;
    metaDescription?: string | undefined;
    variant?: "A" | "B" | undefined;
    conversionRate?: number | undefined;
}>;
export type LandingPage = z.infer<typeof LandingPageSchema>;
export declare const ABTestSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    startDate: z.ZodDate;
    endDate: z.ZodOptional<z.ZodDate>;
    variants: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        content: z.ZodString;
        traffic: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        content: string;
        traffic: number;
    }, {
        name: string;
        content: string;
        traffic: number;
    }>, "many">;
    winner: z.ZodOptional<z.ZodString>;
    active: z.ZodBoolean;
    results: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        views: z.ZodNumber;
        conversions: z.ZodNumber;
        conversionRate: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        views: number;
        conversions: number;
        conversionRate: number;
    }, {
        views: number;
        conversions: number;
        conversionRate: number;
    }>>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    active: boolean;
    startDate: Date;
    variants: {
        name: string;
        content: string;
        traffic: number;
    }[];
    description?: string | undefined;
    endDate?: Date | undefined;
    winner?: string | undefined;
    results?: Record<string, {
        views: number;
        conversions: number;
        conversionRate: number;
    }> | undefined;
}, {
    id: string;
    name: string;
    active: boolean;
    startDate: Date;
    variants: {
        name: string;
        content: string;
        traffic: number;
    }[];
    description?: string | undefined;
    endDate?: Date | undefined;
    winner?: string | undefined;
    results?: Record<string, {
        views: number;
        conversions: number;
        conversionRate: number;
    }> | undefined;
}>;
export type ABTest = z.infer<typeof ABTestSchema>;
export declare const CampaignSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    type: z.ZodEnum<["email", "social", "referral", "content"]>;
    status: z.ZodEnum<["draft", "active", "paused", "completed"]>;
    targetAudience: z.ZodOptional<z.ZodString>;
    content: z.ZodString;
    scheduledAt: z.ZodOptional<z.ZodDate>;
    sentAt: z.ZodOptional<z.ZodDate>;
    metrics: z.ZodOptional<z.ZodObject<{
        sent: z.ZodNumber;
        opened: z.ZodNumber;
        clicked: z.ZodNumber;
        converted: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        sent: number;
        opened: number;
        clicked: number;
        converted: number;
    }, {
        sent: number;
        opened: number;
        clicked: number;
        converted: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    status: "completed" | "active" | "paused" | "draft";
    type: "content" | "email" | "referral" | "social";
    content: string;
    targetAudience?: string | undefined;
    scheduledAt?: Date | undefined;
    sentAt?: Date | undefined;
    metrics?: {
        sent: number;
        opened: number;
        clicked: number;
        converted: number;
    } | undefined;
}, {
    id: string;
    name: string;
    status: "completed" | "active" | "paused" | "draft";
    type: "content" | "email" | "referral" | "social";
    content: string;
    targetAudience?: string | undefined;
    scheduledAt?: Date | undefined;
    sentAt?: Date | undefined;
    metrics?: {
        sent: number;
        opened: number;
        clicked: number;
        converted: number;
    } | undefined;
}>;
export type Campaign = z.infer<typeof CampaignSchema>;
export declare const ViralLoopSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<["referral", "share_output", "embed_widget", "api_integration"]>;
    trigger: z.ZodString;
    reward: z.ZodObject<{
        type: z.ZodEnum<["credits", "discount", "feature_unlock", "trial_extension"]>;
        value: z.ZodNumber;
        forReferrer: z.ZodBoolean;
        forReferred: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        value: number;
        type: "credits" | "discount" | "feature_unlock" | "trial_extension";
        forReferrer: boolean;
        forReferred: boolean;
    }, {
        value: number;
        type: "credits" | "discount" | "feature_unlock" | "trial_extension";
        forReferrer: boolean;
        forReferred: boolean;
    }>;
    active: z.ZodBoolean;
    completions: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    id: string;
    type: "referral" | "share_output" | "embed_widget" | "api_integration";
    active: boolean;
    trigger: string;
    reward: {
        value: number;
        type: "credits" | "discount" | "feature_unlock" | "trial_extension";
        forReferrer: boolean;
        forReferred: boolean;
    };
    completions: number;
}, {
    id: string;
    type: "referral" | "share_output" | "embed_widget" | "api_integration";
    active: boolean;
    trigger: string;
    reward: {
        value: number;
        type: "credits" | "discount" | "feature_unlock" | "trial_extension";
        forReferrer: boolean;
        forReferred: boolean;
    };
    completions: number;
}>;
export type ViralLoop = z.infer<typeof ViralLoopSchema>;
