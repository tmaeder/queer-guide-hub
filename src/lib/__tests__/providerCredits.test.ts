import { describe, expect, it } from 'vitest';
import { creditUsageLine } from '../providerCredits';

describe('creditUsageLine', () => {
  it('states remaining credits, the plan size and when the period ends', () => {
    expect(
      creditUsageLine({
        remainingCredits: 0,
        planCredits: 3000,
        billingPeriodStart: null,
        billingPeriodEnd: '2026-12-01T00:00:00Z',
      }),
    ).toBe('0 of 3,000 credits left · period ends 1 Dec 2026');
  });
  it('omits what Firecrawl did not report', () => {
    expect(
      creditUsageLine({
        remainingCredits: 1200,
        planCredits: null,
        billingPeriodStart: null,
        billingPeriodEnd: null,
      }),
    ).toBe('1,200 credits left');
  });
  it('says why the credits could not be read', () => {
    expect(creditUsageLine({ error: 'Firecrawl credit usage HTTP 401' })).toBe(
      'Credits unavailable: Firecrawl credit usage HTTP 401',
    );
  });
});
