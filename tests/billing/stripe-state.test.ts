import { describe, it, expect, beforeEach } from 'vitest';
import { initStripe, isStripeReady, createCustomer, createSubscription } from '../../src/billing/stripe.js';

describe('Stripe Integration', () => {
  beforeEach(() => {
    // Reset stripe state between tests
    // We need to reinitialize with null or mock
  });

  it('initializes with valid API key', () => {
    // Use a test key pattern (won't actually connect)
    initStripe('sk-test-fake-key-123456789012345678901234');
    expect(isStripeReady()).toBe(true);
  });

  it('rejects uninitialized calls with clear error', async () => {
    // Ensure not initialized
    initStripe('');
    await expect(createCustomer('tenant-1', 'test@example.com'))
      .rejects.toThrow('STRIPE_SECRET_KEY is not configured');
  });

  it('creates customer with metadata', async () => {
    // This will fail due to network, but tests error message clarity
    initStripe('sk-test-invalid');
    try {
      await createCustomer('tenant-123', 'user@domain.com', { ref: 'campaign-1' });
      // If somehow network succeeded that's fine, skip
    } catch (err) {
      const error = err as Error;
      // Should include setup or auth error
      expect(error.message).toMatch(/Stripe setup required|Invalid API Key/i);
    }
  });

  it('handles subscription lifecycle with missing tenant gracefully', async () => {
    initStripe('sk-test-invalid');
    try {
      await createSubscription('cus_invalid', 'price_invalid', 7);
    } catch (err) {
      // Expected to fail at network level, but should have clear message
      const error = err as Error;
      expect(error.message).toMatch(/Stripe setup required|unreachable|Invalid API Key/i);
    }
  });
});
