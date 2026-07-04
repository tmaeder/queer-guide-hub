/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';

import { getBusinessTypeIcon } from '../MarketplaceItemDetail.parts';

describe('MarketplaceItemDetail.parts', () => {
  it('getBusinessTypeIcon returns a value for known type', () => {
    expect(getBusinessTypeIcon('etsy')).toBeDefined();
    expect(getBusinessTypeIcon(null)).toBeDefined();
  });
});
