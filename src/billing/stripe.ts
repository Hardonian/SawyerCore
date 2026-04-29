import Stripe from 'stripe';
import { UsageRecord, UsageEventType, StripeCustomer, BillingPeriod } from './types.js';
import { UsageTracker } from './usage-tracker.js';
import { PricingCatalog } from './pricing.js';

let stripeClient: Stripe | null = null;

export function initStripe(apiKey: string): void {
  stripeClient = new Stripe(apiKey, {
    apiVersion: '2024-06-20'
  });
}

function getStripe(): Stripe {
  if (!stripeClient) {
    throw new Error('Stripe not initialized. Call initStripe() first.');
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
): Promise<{ subscriptionId: string; status: string; periodEnd: Date }> {
  const stripe = getStripe();
  
  const params: Stripe.SubscriptionCreateParams = {
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

export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string
): Promise<void> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  const itemId = subscription.items.data[0].id;
  await stripe.subscriptions.update(subscriptionId, {
    items: [{ id: itemId, price: newPriceId }]
  });
}

export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.cancel(subscriptionId);
}

export async function createInvoice(
  stripeCustomerId: string,
  billingPeriod: BillingPeriod
): Promise<string> {
  const stripe = getStripe();

  const invoice = await stripe.invoices.create({
    customer: stripeCustomerId,
    auto_advance: false
  });

  for (const record of billingPeriod.usageRecords) {
    const tier = PricingCatalog.getTierForTenant(billingPeriod.tenantId);
    const rate = tier?.usageRates[record.eventType as UsageEventType] ?? 0;
    const amount = Math.round(record.quantity * rate * 100);

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
  stripeCustomerId: string,
  record: UsageRecord,
  stripeSubscriptionItemId: string
): Promise<void> {
  const stripe = getStripe();
  const tier = PricingCatalog.getTierForTenant(record.tenantId);
  const rate = tier?.usageRates[record.eventType as UsageEventType] ?? 0;
  const amount = Math.round(record.quantity * rate * 100);

  await stripe.subscriptionItems.createUsageRecord(stripeSubscriptionItemId, {
    quantity: record.quantity,
    timestamp: Math.floor(record.timestamp.getTime() / 1000),
    action: 'increment'
  });
}

export async function getCustomerBalance(
  stripeCustomerId: string
): Promise<number> {
  const stripe = getStripe();
  const balance = await stripe.customers.retrieve(stripeCustomerId);
  
  if ('invoice_credit_balance' in balance && balance.invoice_credit_balance) {
    return (balance.invoice_credit_balance as Record<string, number>)['usd'] ?? 0;
  }
  return 0;
}

export function generatePaymentLink(
  priceId: string,
  tenantId: string,
  referralCode?: string
): string {
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
