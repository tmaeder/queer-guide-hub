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
    const { container } = render(<EditorialEntries onEraSelect={vi.fn()} onProfessionSelect={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
