/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { MarketplaceCard } from '../MarketplaceCard';

describe('MarketplaceCard', () => {
  it('renders loading state', () => {
    const { container } = render(<MemoryRouter><MarketplaceCard loading /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
  it('renders listing', () => {
    const { container } = render(
      <MemoryRouter>
        <MarketplaceCard listing={{ id: 'm1', title: 'Item', slug: 'item', price: 10, currency: 'USD' } as never} />
      </MemoryRouter>,
    );
    expect(container).toBeTruthy();
  });
});
