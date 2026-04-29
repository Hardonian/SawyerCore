import type { BillingPeriod, StripeCustomer, UsageRecord } from './types.js';
type StripeSubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'paused';
interface StripeLikeClient {
    customers: {
        create(params: {
            email: string;
            metadata: Record<string, string>;
        }): Promise<{
            id: string;
        }>;
        retrieve(id: string): Promise<{
            invoice_credit_balance?: Record<string, number>;
        }>;
    };
    subscriptions: {
        create(params: {
            customer: string;
            items: Array<{
                price: string;
            }>;
            payment_behavior: 'default_incomplete';
            trial_period_days?: number;
        }): Promise<{
            id: string;
            status: StripeSubscriptionStatus;
            current_period_end: number;
        }>;
        retrieve(id: string): Promise<{
            items: {
                data: Array<{
                    id: string;
                }>;
            };
        }>;
        update(id: string, params: {
            items: Array<{
                id: string;
                price: string;
            }>;
        }): Promise<unknown>;
        cancel(id: string): Promise<unknown>;
    };
    invoices: {
        create(params: {
            customer: string;
            auto_advance: boolean;
        }): Promise<{
            id: string;
        }>;
        finalizeInvoice(id: string): Promise<{
            id: string;
        }>;
    };
    invoiceItems: {
        create(params: {
            customer: string;
            amount: number;
            currency: 'usd';
            description: string;
        }): Promise<unknown>;
    };
    subscriptionItems: {
        createUsageRecord(id: string, params: {
            quantity: number;
            timestamp: number;
            action: 'increment';
        }): Promise<unknown>;
    };
}
export declare function initStripe(apiKey: string, client?: StripeLikeClient): void;
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
