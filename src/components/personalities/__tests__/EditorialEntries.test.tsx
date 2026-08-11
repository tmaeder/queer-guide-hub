/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/usePersonalities', () => ({ useProfessionFacets: () => ({ facets: [] }) }));
vi.mock('@/hooks/useBornThisWeek', () => ({ useBornThisWeek: () => ({ items: [] }) }));

import { EditorialEntries } from '../EditorialEntries';

describe('EditorialEntries', () => {
  it('renders', () => {
    // No `onEraSelect`: the era stations moved out to <EraLine>, which the
    // page renders itself so that applying a filter cannot unmount them.
    const { container } = render(<EditorialEntries onProfessionSelect={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
