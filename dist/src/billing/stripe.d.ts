import type { BillingPeriod, StripeCustomer, UsageRecord } from './types.js';
type StripeSubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'paused';
export declare function initStripe(apiKey: string, client?: any): void;
export declare function isStripeReady(): boolean;
export declare function createCustomer(tenantId: string, email: string, metadata?: Record<string, string>): Promise<StripeCustomer>;
export declare function createSubscription(stripeCustomerId: string, priceId: string, trialDays?: number): Promise<{
    subscriptionId: string;
    status: StripeSubscriptionStatus;
    periodEnd: Date;
}>;
export declare function updateSubscription(subscriptionId: string, newPriceId: string): Promise<void>;
export declare function cancelSubscription(subscriptionId: string): Promise<void>;
export declare function createInvoice(stripeCustomerId: string, billingPeriod: BillingPeriod): Promise<string>;
export declare function reportUsageToMeter(_stripeCustomerId: string, record: UsageRecord, stripeSubscriptionItemId: string): Promise<void>;
export declare function getCustomerBalance(stripeCustomerId: string): Promise<number>;
export declare function generatePaymentLink(priceId: string, tenantId: string, referralCode?: string): string;
export {};
