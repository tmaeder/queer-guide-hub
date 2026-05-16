/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('@/hooks/useExternalImageSearch', () => ({
  useExternalImageSearch: () => ({
    results: [], loading: false, error: null,
    searchPexelsUnsplash: vi.fn(), searchWikipedia: vi.fn(), clearResults: vi.fn(),
  }),
}));

import ExternalImageSearch from '../ExternalImageSearch';

describe('ExternalImageSearch', () => {
  it('renders', () => {
    const { container } = render(<ExternalImageSearch onSelect={vi.fn()} />);
    expect(container).toBeTruthy();
  });
});
