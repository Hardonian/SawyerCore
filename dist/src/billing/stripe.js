import { PricingCatalog } from './pricing.js';
let stripeClient = null;
let stripeApiKeyConfigured = false;
export function initStripe(apiKey, client) {
    stripeApiKeyConfigured = apiKey.trim().length > 0;
    stripeClient = client ?? null;
}
export function isStripeReady() {
    return stripeClient !== null;
}
function getStripe() {
    if (!stripeApiKeyConfigured) {
        throw new Error('Stripe setup required: STRIPE_SECRET_KEY is not configured');
    }
    if (!stripeClient) {
        throw new Error('Stripe setup required: inject a Stripe client into initStripe(apiKey, client)');
    }
    return stripeClient;
}
export async function createCustomer(tenantId, email, metadata) {
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
export async function createSubscription(stripeCustomerId, priceId, trialDays) {
    const stripe = getStripe();
    const params = {
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
export async function updateSubscription(subscriptionId, newPriceId) {
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
export async function cancelSubscription(subscriptionId) {
    const stripe = getStripe();
    await stripe.subscriptions.cancel(subscriptionId);
}
export async function createInvoice(stripeCustomerId, billingPeriod) {
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
export async function reportUsageToMeter(_stripeCustomerId, record, stripeSubscriptionItemId) {
    const stripe = getStripe();
    await stripe.subscriptionItems.createUsageRecord(stripeSubscriptionItemId, {
        quantity: record.quantity,
        timestamp: Math.floor(record.timestamp.getTime() / 1000),
        action: 'increment'
    });
}
export async function getCustomerBalance(stripeCustomerId) {
    const stripe = getStripe();
    const balance = await stripe.customers.retrieve(stripeCustomerId);
    return balance.invoice_credit_balance?.usd ?? 0;
}
export function generatePaymentLink(priceId, tenantId, referralCode) {
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
function usageRecordAmountCents(record) {
    const tier = PricingCatalog.getTierForTenant(record.tenantId);
    const rate = tier?.usageRates[record.eventType] ?? 0;
    return Math.round(record.quantity * rate * 100);
}
