/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

vi.mock('@/hooks/useSearchActions', () => ({ useTrackClick: () => vi.fn() }));
vi.mock('@/lib/searchClient', () => ({ fetchSimilar: vi.fn().mockResolvedValue([]) }));

import { SimilarItems } from '../SimilarItems';

describe('SimilarItems', () => {
  it('renders', () => {
    const entity = { id: 'e1', contentType: 'venue', title: 'X' } as never;
    const { container } = render(<MemoryRouter><SimilarItems entity={entity} /></MemoryRouter>);
    expect(container).toBeTruthy();
  });
});
