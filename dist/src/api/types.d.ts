import { z } from 'zod';
import { Request } from 'express';
export declare const ApiKeySchema: z.ZodObject<{
    id: z.ZodString;
    key: z.ZodString;
    tenantId: z.ZodString;
    name: z.ZodString;
    createdAt: z.ZodDate;
    expiresAt: z.ZodOptional<z.ZodDate>;
    lastUsedAt: z.ZodOptional<z.ZodDate>;
    scopes: z.ZodArray<z.ZodString, "many">;
    rateLimitPerMinute: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    key: string;
    tenantId: string;
    name: string;
    createdAt: Date;
    scopes: string[];
    expiresAt?: Date | undefined;
    lastUsedAt?: Date | undefined;
    rateLimitPerMinute?: number | undefined;
}, {
    id: string;
    key: string;
    tenantId: string;
    name: string;
    createdAt: Date;
    scopes: string[];
    expiresAt?: Date | undefined;
    lastUsedAt?: Date | undefined;
    rateLimitPerMinute?: number | undefined;
}>;
export type ApiKey = z.infer<typeof ApiKeySchema>;
export interface AuthenticatedRequest extends Request {
    tenantId: string;
    apiKey: ApiKey;
}
export declare const ApiRequestSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    apiKeyId: z.ZodString;
    endpoint: z.ZodString;
    method: z.ZodString;
    timestamp: z.ZodDate;
    latencyMs: z.ZodNumber;
    statusCode: z.ZodNumber;
    requestBodySize: z.ZodOptional<z.ZodNumber>;
    responseBodySize: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenantId: string;
    endpoint: string;
    latencyMs: number;
    apiKeyId: string;
    method: string;
    timestamp: Date;
    statusCode: number;
    requestBodySize?: number | undefined;
    responseBodySize?: number | undefined;
}, {
    id: string;
    tenantId: string;
    endpoint: string;
    latencyMs: number;
    apiKeyId: string;
    method: string;
    timestamp: Date;
    statusCode: number;
    requestBodySize?: number | undefined;
    responseBodySize?: number | undefined;
}>;
export type ApiRequest = z.infer<typeof ApiRequestSchema>;
export declare const TaskInputSchema: z.ZodObject<{
    type: z.ZodEnum<["chat", "completion", "embedding", "classification", "summarization"]>;
    input: z.ZodString;
    model: z.ZodOptional<z.ZodString>;
    parameters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    privacy: z.ZodOptional<z.ZodEnum<["public", "private", "sensitive"]>>;
}, "strip", z.ZodTypeAny, {
    type: "chat" | "completion" | "embedding" | "classification" | "summarization";
    input: string;
    model?: string | undefined;
    parameters?: Record<string, unknown> | undefined;
    privacy?: "public" | "private" | "sensitive" | undefined;
}, {
    type: "chat" | "completion" | "embedding" | "classification" | "summarization";
    input: string;
    model?: string | undefined;
    parameters?: Record<string, unknown> | undefined;
    privacy?: "public" | "private" | "sensitive" | undefined;
}>;
export type TaskInput = z.infer<typeof TaskInputSchema>;
export declare const TaskResultSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    runId: z.ZodString;
    output: z.ZodUnknown;
    provider: z.ZodString;
    latencyMs: z.ZodNumber;
    costUsd: z.ZodNumber;
    tokensUsed: z.ZodOptional<z.ZodNumber>;
    degradedState: z.ZodEnum<["NOMINAL", "MODEL_UNAVAILABLE", "LOW_MEMORY", "PARTIAL_EXECUTION"]>;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenantId: string;
    runId: string;
    latencyMs: number;
    degradedState: "NOMINAL" | "MODEL_UNAVAILABLE" | "LOW_MEMORY" | "PARTIAL_EXECUTION";
    provider: string;
    timestamp: Date;
    costUsd: number;
    output?: unknown;
    tokensUsed?: number | undefined;
}, {
    id: string;
    tenantId: string;
    runId: string;
    latencyMs: number;
    degradedState: "NOMINAL" | "MODEL_UNAVAILABLE" | "LOW_MEMORY" | "PARTIAL_EXECUTION";
    provider: string;
    timestamp: Date;
    costUsd: number;
    output?: unknown;
    tokensUsed?: number | undefined;
}>;
export type TaskResult = z.infer<typeof TaskResultSchema>;
export declare const AgentConfigSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    steps: z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        config: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        config: Record<string, unknown>;
    }, {
        type: string;
        config: Record<string, unknown>;
    }>, "many">;
    triggers: z.ZodArray<z.ZodEnum<["manual", "schedule", "webhook"]>, "many">;
    enabled: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenantId: string;
    name: string;
    steps: {
        type: string;
        config: Record<string, unknown>;
    }[];
    triggers: ("manual" | "schedule" | "webhook")[];
    enabled: boolean;
    description?: string | undefined;
}, {
    id: string;
    tenantId: string;
    name: string;
    steps: {
        type: string;
        config: Record<string, unknown>;
    }[];
    triggers: ("manual" | "schedule" | "webhook")[];
    enabled: boolean;
    description?: string | undefined;
}>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export declare const ReferralSchema: z.ZodObject<{
    id: z.ZodString;
    referrerTenantId: z.ZodString;
    referredEmail: z.ZodString;
    code: z.ZodString;
    status: z.ZodEnum<["pending", "completed", "expired"]>;
    createdAt: z.ZodDate;
    convertedAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    status: "pending" | "completed" | "expired";
    code: string;
    referrerTenantId: string;
    referredEmail: string;
    convertedAt?: Date | undefined;
}, {
    id: string;
    createdAt: Date;
    status: "pending" | "completed" | "expired";
    code: string;
    referrerTenantId: string;
    referredEmail: string;
    convertedAt?: Date | undefined;
}>;
export type Referral = z.infer<typeof ReferralSchema>;
export declare const ShareableOutputSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    runId: z.ZodString;
    title: z.ZodString;
    content: z.ZodUnknown;
    publicUrl: z.ZodString;
    createdAt: z.ZodDate;
    expiresAt: z.ZodOptional<z.ZodDate>;
    views: z.ZodNumber;
    password: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    tenantId: string;
    createdAt: Date;
    runId: string;
    title: string;
    publicUrl: string;
    views: number;
    expiresAt?: Date | undefined;
    content?: unknown;
    password?: string | undefined;
}, {
    id: string;
    tenantId: string;
    createdAt: Date;
    runId: string;
    title: string;
    publicUrl: string;
    views: number;
    expiresAt?: Date | undefined;
    content?: unknown;
    password?: string | undefined;
}>;
export type ShareableOutput = z.infer<typeof ShareableOutputSchema>;
export declare const TenantSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    email: z.ZodString;
    createdAt: z.ZodDate;
    status: z.ZodEnum<["active", "suspended", "trial", "past_due"]>;
    plan: z.ZodString;
    resourceLimits: z.ZodObject<{
        maxConcurrentTasks: z.ZodNumber;
        maxStorageBytes: z.ZodNumber;
        maxApiCallsPerMinute: z.ZodNumber;
        maxAgents: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        maxConcurrentTasks: number;
        maxStorageBytes: number;
        maxApiCallsPerMinute: number;
        maxAgents: number;
    }, {
        maxConcurrentTasks: number;
        maxStorageBytes: number;
        maxApiCallsPerMinute: number;
        maxAgents: number;
    }>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    createdAt: Date;
    status: "active" | "suspended" | "trial" | "past_due";
    email: string;
    plan: string;
    resourceLimits: {
        maxConcurrentTasks: number;
        maxStorageBytes: number;
        maxApiCallsPerMinute: number;
        maxAgents: number;
    };
    metadata?: Record<string, unknown> | undefined;
}, {
    id: string;
    name: string;
    createdAt: Date;
    status: "active" | "suspended" | "trial" | "past_due";
    email: string;
    plan: string;
    resourceLimits: {
        maxConcurrentTasks: number;
        maxStorageBytes: number;
        maxApiCallsPerMinute: number;
        maxAgents: number;
    };
    metadata?: Record<string, unknown> | undefined;
}>;
export type Tenant = z.infer<typeof TenantSchema>;
