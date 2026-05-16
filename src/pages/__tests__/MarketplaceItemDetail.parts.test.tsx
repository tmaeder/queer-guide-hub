/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

import { formatPrice, getBusinessTypeIcon } from '../MarketplaceItemDetail.parts';

describe('MarketplaceItemDetail.parts', () => {
  it('formatPrice returns a string', () => {
    const result = formatPrice({ price: 100, currency: 'USD' } as never);
    expect(typeof result).toBe('string');
  });
  it('getBusinessTypeIcon returns a value for known type', () => {
    expect(getBusinessTypeIcon('etsy')).toBeDefined();
    expect(getBusinessTypeIcon(null)).toBeDefined();
  });
});
