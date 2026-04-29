import type { BillingPeriod, StripeCustomer, UsageEventType, UsageRecord } from './types.js';
import { PricingCatalog } from './pricing.js';

type StripeSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

interface StripeLikeClient {
  customers: {
    create(params: { email: string; metadata: Record<string, string> }): Promise<{ id: string }>;
    retrieve(id: string): Promise<{ invoice_credit_balance?: Record<string, number> }>;
  };
  subscriptions: {
    create(params: {
      customer: string;
      items: Array<{ price: string }>;
      payment_behavior: 'default_incomplete';
      trial_period_days?: number;
    }): Promise<{ id: string; status: StripeSubscriptionStatus; current_period_end: number }>;
    retrieve(id: string): Promise<{ items: { data: Array<{ id: string }> } }>;
    update(id: string, params: { items: Array<{ id: string; price: string }> }): Promise<unknown>;
    cancel(id: string): Promise<unknown>;
  };
  invoices: {
    create(params: { customer: string; auto_advance: boolean }): Promise<{ id: string }>;
    finalizeInvoice(id: string): Promise<{ id: string }>;
  };
  invoiceItems: {
    create(params: { customer: string; amount: number; currency: 'usd'; description: string }): Promise<unknown>;
  };
  subscriptionItems: {
    createUsageRecord(
      id: string,
      params: { quantity: number; timestamp: number; action: 'increment' }
    ): Promise<unknown>;
  };
}

import Stripe from 'stripe';

let stripeClient: any | null = null;
let stripeApiKeyConfigured = false;

export function initStripe(apiKey: string, client?: any): void {
  stripeApiKeyConfigured = apiKey.trim().length > 0;
  if (client) {
    stripeClient = client;
  } else if (stripeApiKeyConfigured) {
    stripeClient = new Stripe(apiKey, {
      apiVersion: '2024-04-10' as any, // Use latest stable
    });
  }
}

export function isStripeReady(): boolean {
  return stripeClient !== null;
}

function getStripe(): StripeLikeClient {
  if (!stripeApiKeyConfigured) {
    throw new Error('Stripe setup required: STRIPE_SECRET_KEY is not configured');
  }
  if (!stripeClient) {
    throw new Error('Stripe setup required: inject a Stripe client into initStripe(apiKey, client)');
  }
  return stripeClient;
}

export async function createCustomer(
  tenantId: string,
  email: string,
  metadata?: Record<string, string>
): Promise<StripeCustomer> {
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: {
      tenantId,
      ...metadata
    }
  });

  return {
    stripeCustomerId: customer.id,
    tenantId,
    email,
    subscriptionStatus: undefined
  };
}

export async function createSubscription(
  stripeCustomerId: string,
  priceId: string,
  trialDays?: number
): Promise<{ subscriptionId: string; status: StripeSubscriptionStatus; periodEnd: Date }> {
  const stripe = getStripe();
  const params: {
    customer: string;
    items: Array<{ price: string }>;
    payment_behavior: 'default_incomplete';
    trial_period_days?: number;
  } = {
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete'
  };

  if (trialDays && trialDays > 0) {
    params.trial_period_days = trialDays;
  }

  const subscription = await stripe.subscriptions.create(params);

  return {
    subscriptionId: subscription.id,
    status: subscription.status,
    periodEnd: new Date(subscription.current_period_end * 1000)
  };
}

export async function updateSubscription(subscriptionId: string, newPriceId: string): Promise<void> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) {
    throw new Error('Stripe subscription has no subscription items');
  }
  await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: newPriceId }]
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.cancel(subscriptionId);
}

export async function createInvoice(stripeCustomerId: string, billingPeriod: BillingPeriod): Promise<string> {
  const stripe = getStripe();
  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    auto_advance: false
  });

  for (const record of billingPeriod.usageRecords) {
    const amount = usageRecordAmountCents(record);
    if (amount > 0) {
      await stripe.invoiceItems.create({
        customer: stripeCustomerId,
        amount,
        currency: 'usd',
        description: `${record.eventType} usage: ${record.quantity} ${record.unit}`
      });
    }
  }

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
  return finalized.id;
}

export async function reportUsageToMeter(
  _stripeCustomerId: string,
  record: UsageRecord,
  stripeSubscriptionItemId: string
): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptionItems.createUsageRecord(stripeSubscriptionItemId, {
    quantity: record.quantity,
    timestamp: Math.floor(record.timestamp.getTime() / 1000),
    action: 'increment'
  });
}

export async function getCustomerBalance(stripeCustomerId: string): Promise<number> {
  const stripe = getStripe();
  const balance = await stripe.customers.retrieve(stripeCustomerId);
  return balance.invoice_credit_balance?.usd ?? 0;
}

export function generatePaymentLink(priceId: string, tenantId: string, referralCode?: string): string {
  const baseUrl = process.env.STRIPE_PAYMENT_LINK_BASE;
  if (!baseUrl) {
    throw new Error('STRIPE_PAYMENT_LINK_BASE environment variable not set');
  }

  const params = new URLSearchParams({
    tenant_id: tenantId,
    price: priceId
  });

  if (referralCode) {
    params.append('ref', referralCode);
  }

  return `${baseUrl}?${params.toString()}`;
}

function usageRecordAmountCents(record: UsageRecord): number {
  const tier = PricingCatalog.getTierForTenant(record.tenantId);
  const rate = tier?.usageRates[record.eventType as UsageEventType] ?? 0;
  return Math.round(record.quantity * rate * 100);
}
